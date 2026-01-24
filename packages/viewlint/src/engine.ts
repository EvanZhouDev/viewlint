import type { Locator } from "playwright"
import { debug as viewlintDebug } from "./debug.js"
import { collectIgnoredSelectors } from "./engine/collectIgnoredSelectors.js"
import { RuleEvaluator } from "./engine/evaluator.js"
import { ensureFinderRuntime, hasFinderRuntime } from "./engine/finder.js"
import {
	disposeRuleScope,
	type ResolvedRuleScope,
	resolveRuleScope,
} from "./engine/scope.js"
import type { ResolvedOptions } from "./resolveOptions.js"
import { concatSetupOptsLayers, mergeSetupOptsLayers } from "./setupOpts.js"
import type {
	LintLocation,
	LintMessage,
	LintResult,
	Scope,
	SetupOpts,
	Target,
	ViewInstance,
	ViolationReport,
} from "./types.js"

type ScrollPosition = {
	x: number
	y: number
}

declare global {
	interface Window {
		__viewlint_report?: (payload: unknown) => Promise<void>
		__viewlint_report_payload?: (violation: {
			message: string
			element: Element
			relations?: Array<{ description: string; element: Element }>
		}) => void
	}
}

function computeCounts(
	messages: LintMessage[],
): Pick<
	LintResult,
	"errorCount" | "warningCount" | "infoCount" | "recommendCount"
> {
	let errorCount = 0
	let warningCount = 0
	let infoCount = 0

	for (const message of messages) {
		if (message.severity === "error") errorCount += 1
		if (message.severity === "warn") warningCount += 1
		if (message.severity === "info") infoCount += 1
	}

	return {
		errorCount,
		warningCount,
		infoCount,
		recommendCount: infoCount,
	}
}

export async function locatorToLocationDescriptor(
	element: Locator,
): Promise<LintLocation> {
	return await element.evaluate((x) => {
		if (!window.__viewlint_finder) {
			throw new Error(
				"viewlint finder runtime is missing. Ensure it is injected before resolving element selectors.",
			)
		}

		return {
			element: {
				tagName: x.tagName.toLowerCase(),
				id: x.id,
				classes: Array.from(x.classList),
				selector: window.__viewlint_finder(x),
			},
		}
	})
}

function getEnabledRuleIds(resolved: ResolvedOptions): string[] {
	const enabled: string[] = []

	for (const [ruleId, config] of resolved.rules.entries()) {
		if (config.severity !== "off") enabled.push(ruleId)
	}

	enabled.sort()
	return enabled
}

export class ViewLintEngine {
	private resolved: ResolvedOptions

	constructor(resolved: ResolvedOptions) {
		this.resolved = resolved
	}

	private logVerbose(message: string): void {
		viewlintDebug(message)
	}

	async lintTargets(targets: Target[]): Promise<LintResult[]> {
		const enabledRuleIds = getEnabledRuleIds(this.resolved)
		this.logVerbose(`enabled rules: ${enabledRuleIds.length}`)

		const results: LintResult[] = []

		for (const target of targets) {
			const targetLayers = concatSetupOptsLayers(target.options)
			const mergedSetupOpts = mergeSetupOptsLayers(targetLayers)

			let viewInstance: ViewInstance | undefined
			try {
				viewInstance = await target.view.setup(mergedSetupOpts)
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error)
				throw new Error(`Error setting up view: ${message}`)
			}

			try {
				await this.lintViewInstance({
					enabledRuleIds,
					viewInstance,
					setupOpts: mergedSetupOpts,
					scopes: target.scope,
					results,
				})
			} finally {
				await viewInstance.close()
			}
		}

		return results
	}

	private async lintViewInstance(args: {
		enabledRuleIds: string[]
		viewInstance: ViewInstance
		setupOpts: SetupOpts
		scopes: Scope | Scope[] | undefined
		results: LintResult[]
	}): Promise<void> {
		const page = args.viewInstance.page
		await ensureFinderRuntime(page)
		if (!(await hasFinderRuntime(page))) {
			this.logVerbose(
				"finder runtime missing after view.setup and installation; attempting page reset",
			)
			await args.viewInstance.reset()
			await ensureFinderRuntime(page)
			if (!(await hasFinderRuntime(page))) {
				throw new Error(
					"Failed to install ViewLint finder runtime. This page may block script injection (CSP) or the View did not allow init scripts to run before navigation.",
				)
			}
		}

		let scopeState: ResolvedRuleScope | undefined
		try {
			scopeState = await resolveRuleScope({
				page,
				opts: args.setupOpts,
				scopes: args.scopes,
			})
			let activeNodeScope = scopeState.nodeScope
			let activeBrowserScopeHandle = scopeState.browserScopeHandle

			let url = page.url()

			const evaluator = new RuleEvaluator({
				page,
				scopeHandle: activeBrowserScopeHandle,
				logVerbose: (message) => this.logVerbose(message),
			})
			const evaluate = evaluator.evaluate.bind(evaluator)

			const messages: LintMessage[] = []
			const suppressedMessages: LintMessage[] = []

			for (const ruleId of args.enabledRuleIds) {
				const ruleConfig = this.resolved.rules.get(ruleId)
				const rule = this.resolved.ruleRegistry.get(ruleId)

				const ruleStartMs = Date.now()
				this.logVerbose(`rule:start ${ruleId}`)

				if (!ruleConfig || !rule) {
					throw new Error(
						`Internal error: enabled rule '${ruleId}' is missing from resolved config.`,
					)
				}

				const bufferedViolations: ViolationReport[] = []
				const report = (violation: ViolationReport): void => {
					if (ruleConfig.severity === "off") return
					bufferedViolations.push(violation)
				}

				evaluator.setActiveBuffer(bufferedViolations)

				const initialScroll: ScrollPosition = await page.evaluate(() => {
					return { x: window.scrollX, y: window.scrollY }
				})

				try {
					await rule.run({
						url,
						page,
						options: ruleConfig.options,
						scope: activeNodeScope,
						report,
						evaluate,
					})
					this.logVerbose(
						`rule:finish ${ruleId} (${Date.now() - ruleStartMs}ms)`,
					)
				} finally {
					evaluator.setActiveBuffer(undefined)
					await page.evaluate((pos: ScrollPosition) => {
						window.scrollTo(pos.x, pos.y)
					}, initialScroll)
				}

				type ResolvedViolation = {
					message: string
					location: LintLocation
					relations?: Array<{
						description: string
						location: LintLocation
					}>
				}

				const resolvedViolations: ResolvedViolation[] = []
				const ignoreTargetSelectors: string[] = []

				for (const violation of bufferedViolations) {
					const location =
						"location" in violation
							? violation.location
							: await locatorToLocationDescriptor(violation.element)

					const relations = violation.relations
						? await Promise.all(
								violation.relations.map(async (relation) => {
									const relationLocation =
										"location" in relation
											? relation.location
											: await locatorToLocationDescriptor(relation.element)

									return {
										description: relation.description,
										location: relationLocation,
									}
								}),
							)
						: undefined

					resolvedViolations.push({
						message: violation.message,
						location,
						relations,
					})

					const ignoreTarget = location.element.selector
					if (ignoreTarget) ignoreTargetSelectors.push(ignoreTarget)
				}

				const ignoredSelectors =
					ignoreTargetSelectors.length > 0
						? await collectIgnoredSelectors(page, ruleId, ignoreTargetSelectors)
						: new Set<string>()

				for (const resolvedViolation of resolvedViolations) {
					const ignoreTarget = resolvedViolation.location.element.selector
					
					// Reference to either suppressedMessages or messages
					const bucket =
						ignoreTarget && ignoredSelectors.has(ignoreTarget)
							? suppressedMessages
							: messages

					const effectiveSeverity = ruleConfig.severity
					if (effectiveSeverity === "off") {
						throw new Error(
							"Internal error: effective severity must be a reportable severity",
						)
					}

					bucket.push({
						ruleId,
						message: resolvedViolation.message,
						location: resolvedViolation.location,
						relations: (resolvedViolation.relations ?? []).map((relation) => {
							return {
								description: relation.description,
								location: relation.location,
							}
						}),
						severity: effectiveSeverity,
					})
				}

				if (rule.meta?.hasSideEffects === true) {
					this.logVerbose(`rule:reset ${ruleId}`)
					await disposeRuleScope(scopeState)
					await args.viewInstance.reset()
					url = page.url()
					scopeState = await resolveRuleScope({
						page,
						opts: args.setupOpts,
						scopes: args.scopes,
					})
					activeNodeScope = scopeState.nodeScope
					activeBrowserScopeHandle = scopeState.browserScopeHandle
					evaluator.setScopeHandle(activeBrowserScopeHandle)
				}
			}

			args.results.push({
				url,
				messages,
				suppressedMessages,
				...computeCounts(messages),
			})
		} finally {
			if (scopeState) {
				await disposeRuleScope(scopeState)
			}
		}
	}
}
