import fs from "node:fs"

import {
	type BrowserContext,
	chromium,
	type JSHandle,
	type Locator,
	type Page,
} from "playwright"

import type { ResolvedOptions } from "./resolveOptions.js"
import type {
	BrowserViolationReporter,
	LintLocation,
	LintMessage,
	LintResult,
	Unboxed,
	ViolationReport,
} from "./types.js"

type ScrollPosition = {
	x: number
	y: number
}

const DISABLE_ANIMATIONS_CSS = `
* {
	animation: none !important;
	transition: none !important;
	scroll-behavior: auto !important;
}
`

type PageBundle = {
	page: Page
	isBrowserReportInstalled: boolean
}

declare global {
	interface Window {
		__viewlint_finder?: (el: Element) => string
		__viewlint_report?: (payload: unknown) => Promise<void>
		__viewlint_report_payload?: (violation: {
			message: string
			element: Element
			relations?: Array<{ description: string; element: Element }>
		}) => void
	}
}

let cachedFinderInitScript: string | undefined

function getFinderInitScript(): string {
	if (cachedFinderInitScript) return cachedFinderInitScript

	const raw = fs.readFileSync(
		new URL("./vendor/mdev.finder.js", import.meta.url),
		"utf8",
	)

	const asBrowserScript = raw.split("export ").join("")

	cachedFinderInitScript = `${asBrowserScript}

;(function () {
	if (window.__viewlint_finder) return
	window.__viewlint_finder = finder
})()`

	return cachedFinderInitScript
}

function getEnabledRuleIds(resolved: ResolvedOptions): string[] {
	const enabled: string[] = []

	for (const [ruleId, config] of resolved.rules.entries()) {
		if (config.severity !== "off") enabled.push(ruleId)
	}

	enabled.sort()
	return enabled
}

function toLintMessage(violation: {
	ruleId: string
	message: string
	severity: LintMessage["severity"]
	location: LintMessage["location"]
	relations?: Array<{
		description: string
		location: LintMessage["location"]
	}>
}): LintMessage {
	return {
		ruleId: violation.ruleId,
		message: violation.message,
		location: violation.location,
		relations: (violation.relations ?? []).map((relation) => {
			return {
				description: relation.description,
				location: relation.location,
			}
		}),
		severity: violation.severity,
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

async function locatorToLocationDescriptor(
	element: Locator | HTMLElement,
): Promise<LintLocation> {
	if ("elementHandle" in element) {
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

	// We can't reliably inspect HTMLElements in Node. Require a Locator.
	throw new Error(
		"viewlint internal error: expected a Locator for element resolution",
	)
}

async function collectIgnoredSelectors(
	page: Page,
	ruleId: string,
	selectors: string[],
): Promise<Set<string>> {
	const uniqueSelectors = [...new Set(selectors)].filter(
		(selector) => selector.trim().length > 0,
	)
	if (uniqueSelectors.length === 0) return new Set()

	const ignoredSelectors: string[] = await page.evaluate(
		(payload: { ruleId: string; selectors: string[] }) => {
			const tokenize = (value: string): string[] => {
				return value
					.split(/[\s,]+/)
					.map((token) => token.trim())
					.filter((token) => token.length > 0)
			}

			const matchesRule = (tokens: string[], ruleId: string): boolean => {
				return (
					tokens.length === 0 ||
					tokens.includes("all") ||
					tokens.includes("*") ||
					tokens.includes(ruleId)
				)
			}

			const isIgnored = (el: Element | null, ruleId: string): boolean => {
				let current: Element | null = el

				while (current) {
					if (current.hasAttribute("data-viewlint-ignore")) {
						const raw = current.getAttribute("data-viewlint-ignore")
						const tokens = raw ? tokenize(raw) : []
						if (matchesRule(tokens, ruleId)) return true
					}

					current = current.parentElement
				}

				return false
			}

			return payload.selectors.filter((selector) => {
				try {
					const el = document.querySelector(selector)
					return isIgnored(el, payload.ruleId)
				} catch {
					return false
				}
			})
		},
		{ ruleId, selectors: uniqueSelectors },
	)

	return new Set(ignoredSelectors)
}

export class ViewLintEngine {
	private resolved: ResolvedOptions

	constructor(resolved: ResolvedOptions) {
		this.resolved = resolved
	}

	private logVerbose(message: string): void {
		if (!this.resolved.debug.verbose) return
		process.stderr.write(`${message}\n`)
	}

	private async createPageBundle(context: BrowserContext): Promise<PageBundle> {
		const page = await context.newPage()
		this.logVerbose("[viewlint] inject finder runtime")
		await page.addInitScript({ content: getFinderInitScript() })

		return { page, isBrowserReportInstalled: false }
	}

	private async disposePageBundle(bundle: PageBundle): Promise<void> {
		await bundle.page.close()
	}

	private async setupBrowser(page: Page, url: string): Promise<void> {
		this.logVerbose(`[viewlint] goto ${url}`)
		await page.goto(url, {
			waitUntil: this.resolved.browser.waitUntil,
			timeout: this.resolved.browser.timeoutMs,
		})

		if (this.resolved.browser.disableAnimations) {
			this.logVerbose("[viewlint] inject disable-animations css")
			await page.addStyleTag({ content: DISABLE_ANIMATIONS_CSS })
		}
	}

	async lintUrls(urls: string | string[]): Promise<LintResult[]> {
		const urlList = Array.isArray(urls) ? urls : [urls]

		const enabledRuleIds = getEnabledRuleIds(this.resolved)
		this.logVerbose(`[viewlint] enabled rules: ${enabledRuleIds.length}`)

		const browser = await chromium.launch({
			headless: this.resolved.browser.headless,
		})

		const context = await browser.newContext({
			viewport: this.resolved.browser.viewport,
		})

		try {
			const results: LintResult[] = []

			for (const url of urlList) {
				const baseBundle = await this.createPageBundle(context)

				try {
					await this.setupBrowser(baseBundle.page, url)

					const messages: LintMessage[] = []
					const suppressedMessages: LintMessage[] = []
					let activeBufferedViolations: ViolationReport[] | undefined

					let currentBundle: PageBundle = baseBundle

					for (let i = 0; i < enabledRuleIds.length; i++) {
						const ruleId = enabledRuleIds[i]
						if (!ruleId) throw new Error("Internal error: missing enabled rule")

						const ruleConfig = this.resolved.rules.get(ruleId)
						const rule = this.resolved.ruleRegistry.get(ruleId)

						const ruleStartMs = Date.now()
						this.logVerbose(`[viewlint] rule:start ${ruleId}`)

						if (!ruleConfig || !rule) {
							throw new Error(
								`Internal error: enabled rule '${ruleId}' is missing from resolved config.`,
							)
						}

						const hasSideEffects = rule.meta?.hasSideEffects === true
						const activeBundle = hasSideEffects
							? await this.createPageBundle(context)
							: currentBundle

						if (hasSideEffects) {
							this.logVerbose(`[viewlint] rule:isolate ${ruleId}`)
							await this.setupBrowser(activeBundle.page, url)
						}

						const page = activeBundle.page
						let isBrowserReportInstalled = activeBundle.isBrowserReportInstalled
						// Keep bundle state in sync if we install the binding.

						const bufferedViolations: ViolationReport[] = []

						type PageViolationReportWire = {
							message: string
							location: LintLocation
							relations?: Array<{
								description: string
								location: LintLocation
							}>
						}

						const installBrowserReportIfNeeded = async (): Promise<void> => {
							if (isBrowserReportInstalled) return
							isBrowserReportInstalled = true
							this.logVerbose("[viewlint] install browser report binding")

							await page.exposeBinding(
								"__viewlint_report",
								async (_source: unknown, wire: PageViolationReportWire) => {
									if (!activeBufferedViolations) {
										throw new Error(
											"viewlint internal error: __viewlint_report called with no active rule",
										)
									}

									activeBufferedViolations.push({
										message: wire.message,
										location: wire.location,
										relations: wire.relations,
									})
								},
							)

							await page.addInitScript(() => {
								const w = window

								const installPayloadHelper = () => {
									w.__viewlint_report_payload = (violation) => {
										const toLocation = (el: Element) => {
											if (!w.__viewlint_finder) {
												throw new Error(
													"viewlint finder runtime is missing. Ensure it is injected before resolving element selectors.",
												)
											}

											return {
												element: {
													selector: w.__viewlint_finder(el),
													tagName: el.tagName.toLowerCase(),
													id: el.id,
													classes: Array.from(el.classList),
												},
											}
										}

										const location = toLocation(violation.element)

										const relations = violation.relations?.map((r) => {
											return {
												description: r.description,
												location: toLocation(r.element),
											}
										})

										if (typeof w.__viewlint_report !== "function") {
											throw new Error(
												"viewlint internal error: __viewlint_report binding missing",
											)
										}
										w.__viewlint_report({
											message: violation.message,
											location,
											relations,
										})
									}
								}

								installPayloadHelper()

								// Re-install after cross-origin navigations that reset the JS world.
								w.addEventListener(
									"pageshow",
									() => {
										try {
											installPayloadHelper()
										} catch {
											// ignore
										}
									},
									{ once: false },
								)
							})
						}
						const report = (violation: ViolationReport): void => {
							if (ruleConfig.severity === "off") return
							bufferedViolations.push(violation)
						}

						activeBufferedViolations = bufferedViolations

						type BrowserReportFn = BrowserViolationReporter

						/**
						 * Ensures the browser report binding is installed and ready.
						 * Returns a handle to the report function for use in page.evaluate.
						 */
						async function prepareReportHandle(): Promise<
							JSHandle<BrowserReportFn>
						> {
							await installBrowserReportIfNeeded()
							// Note: This runs inside each rule so we can re-init after navigations.
							// When verbose is enabled, the outer engine logs rule start/finish.

							await page.evaluate(() => {
								// Already set up, skip
								if (typeof window.__viewlint_report_payload === "function")
									return

								window.__viewlint_report_payload = (violation) => {
									const toLocation = (el: Element) => {
										if (!window.__viewlint_finder) {
											throw new Error(
												"viewlint finder runtime is missing. Ensure it is injected before resolving element selectors.",
											)
										}
										return {
											element: {
												selector: window.__viewlint_finder(el),
												tagName: el.tagName.toLowerCase(),
												id: el.id,
												classes: Array.from(el.classList),
											},
										}
									}

									const location = toLocation(violation.element)
									const relations = violation.relations?.map((r) => {
										return {
											description: r.description,
											location: toLocation(r.element),
										}
									})

									if (typeof window.__viewlint_report !== "function") {
										throw new Error(
											"viewlint internal error: __viewlint_report binding missing",
										)
									}
									window.__viewlint_report({
										message: violation.message,
										location,
										relations,
									})
								}
							})

							return await page.evaluateHandle((): BrowserReportFn => {
								const payload = window.__viewlint_report_payload
								if (typeof payload !== "function") {
									throw new Error(
										"viewlint internal error: __viewlint_report_payload missing",
									)
								}
								return payload
							})
						}

						type EvaluateNoArgPayload = { report: BrowserReportFn }
						type EvaluateNoArgWire = { report: JSHandle<BrowserReportFn> }

						type EvaluateWithArgPayload = {
							report: BrowserReportFn
							arg: unknown
						}
						type EvaluateWithArgWire = {
							report: JSHandle<BrowserReportFn>
							arg: unknown
						}

						async function evaluateNoArg<T>(
							fn: (payload: EvaluateNoArgPayload) => T | Promise<T>,
						): Promise<T> {
							const reportHandle = await prepareReportHandle()
							try {
								const wire: EvaluateNoArgWire = { report: reportHandle }
								return await page.evaluate<T, EvaluateNoArgWire>(fn, wire)
							} finally {
								await reportHandle.dispose()
							}
						}

						async function evaluateWithArg<T>(
							fn: (payload: EvaluateWithArgPayload) => T | Promise<T>,
							arg: unknown,
						): Promise<T> {
							const reportHandle = await prepareReportHandle()
							try {
								const wire: EvaluateWithArgWire = {
									report: reportHandle,
									arg,
								}
								return await page.evaluate<T, EvaluateWithArgWire>(fn, wire)
							} finally {
								await reportHandle.dispose()
							}
						}

						function evaluate<T>(
							fn: (payload: EvaluateNoArgPayload) => T | Promise<T>,
						): Promise<T>
						function evaluate<T, Arg>(
							fn: (payload: {
								report: BrowserReportFn
								arg: Unboxed<Arg>
							}) => T | Promise<T>,
							arg: Arg,
						): Promise<T>
						function evaluate<T>(expression: string): Promise<T>
						function evaluate<T, Arg>(expression: string, arg: Arg): Promise<T>
						function evaluate<T, Arg>(
							...args:
								| [fn: (payload: EvaluateNoArgPayload) => T | Promise<T>]
								| [
										fn: (payload: {
											report: BrowserReportFn
											arg: Unboxed<Arg>
										}) => T | Promise<T>,
										arg: Arg,
								  ]
								| [expression: string]
								| [expression: string, arg: Arg]
						): Promise<T> {
							if (typeof args[0] === "string") {
								const expression = args[0]
								const arg = args[1]
								if (!arg) {
									return page.evaluate<T>(expression)
								}

								// Delegate to Playwright for exact string expression semantics.
								// `report` injection only happens for function evaluations.
								return args.length === 1
									? page.evaluate<T>(expression)
									: page.evaluate<T, Arg>(expression, arg)
							}

							if (args.length === 1) {
								const fn = args[0]
								return evaluateNoArg(fn)
							}

							// biome-ignore lint: Playwright unboxes evaluation args (ElementHandle/JSHandle -> underlying value). TS can't prove Unboxed<Arg> equals Arg for generics; we mirror `page.evaluate<R, Arg>`.
							const fn = args[0] as (
								payload: EvaluateWithArgPayload,
							) => T | Promise<T>
							const arg = args[1]
							return evaluateWithArg(fn, arg)
						}

						const initialScroll: ScrollPosition = await page.evaluate(() => {
							return { x: window.scrollX, y: window.scrollY }
						})

						try {
							await rule.run({
								url,
								page,
								options: ruleConfig.options,
								report,
								evaluate,
							})
							this.logVerbose(
								`[viewlint] rule:finish ${ruleId} (${Date.now() - ruleStartMs}ms)`,
							)
						} finally {
							activeBufferedViolations = undefined
							await page.evaluate((pos: ScrollPosition) => {
								window.scrollTo(pos.x, pos.y)
							}, initialScroll)
						}

						activeBundle.isBrowserReportInstalled = isBrowserReportInstalled
						if (hasSideEffects) {
							await this.disposePageBundle(activeBundle)
						} else {
							currentBundle = activeBundle
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
								? await collectIgnoredSelectors(
										page,
										ruleId,
										ignoreTargetSelectors,
									)
								: new Set<string>()

						for (const resolvedViolation of resolvedViolations) {
							const ignoreTarget = resolvedViolation.location.element.selector
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

							bucket.push(
								toLintMessage({
									ruleId,
									message: resolvedViolation.message,
									severity: effectiveSeverity,
									location: resolvedViolation.location,
									relations: resolvedViolation.relations,
								}),
							)
						}

						// Side effect rules are run in a fresh page instance per rule.
					}

					results.push({
						url,
						messages,
						suppressedMessages,
						...computeCounts(messages),
					})
				} finally {
					await this.disposePageBundle(baseBundle)
				}
			}

			return results
		} finally {
			await context.close()
			await browser.close()
		}
	}
}
