import chalk from "chalk"
import { toArray } from "../helpers.js"
import { concatSetupOptsLayers, mergeSetupOptsLayers } from "../setupOpts.js"
import type {
	ElementDescriptor,
	LintMessage,
	LintResult,
	ReportSeverity,
	Target,
} from "../types.js"

const SEVERITY_SORT_WEIGHT: Record<ReportSeverity, number> = {
	error: 0,
	warn: 1,
	info: 2,
}

function assertNever(value: never): never {
	throw new Error(`Unexpected value: ${String(value)}`)
}

function severityComparator(a: ReportSeverity, b: ReportSeverity): number {
	return SEVERITY_SORT_WEIGHT[a] - SEVERITY_SORT_WEIGHT[b]
}

function colorForSeverity(severity: ReportSeverity): (text: string) => string {
	switch (severity) {
		case "error":
			return chalk.red
		case "warn":
			return chalk.yellow
		case "info":
			return chalk.blue
		default:
			return assertNever(severity)
	}
}

function formatSeverityLabel(severity: ReportSeverity): string {
	return colorForSeverity(severity)(severity)
}

function normalizeElementDescriptor(element: ElementDescriptor): {
	tagName: string
	id: string | undefined
	classes: string[]
	selector: string
} {
	const tagName = element.tagName.trim()
	const id = element.id.trim().length ? element.id.trim() : undefined

	const classes = element.classes
		.map((c) => c.trim())
		.filter((c) => c.length > 0)

	return {
		tagName,
		id,
		classes,
		selector: element.selector,
	}
}

function formatElementInline(element: ElementDescriptor): string {
	const normalized = normalizeElementDescriptor(element)

	let identity = normalized.tagName
	if (normalized.id) identity += `#${normalized.id}`

	const classPart = normalized.classes.slice(0, 4).join(".")
	if (classPart) identity += `.${classPart}`

	const selectorText = normalized.selector.trim()

	return `${chalk.cyan(identity)}  ${chalk.dim("(selector:")} ${chalk.gray(
		JSON.stringify(selectorText),
	)}${chalk.dim(")")}`
}

function sortMessages(messages: LintMessage[]): LintMessage[] {
	return [...messages].sort((a, b) => {
		const delta = severityComparator(a.severity, b.severity)
		if (delta !== 0) return delta

		const ruleDelta = a.ruleId.localeCompare(b.ruleId)
		if (ruleDelta !== 0) return ruleDelta

		return a.message.localeCompare(b.message)
	})
}

function highestSeverityForCounts(counts: {
	errorCount: number
	warningCount: number
	infoCount: number
}): ReportSeverity | undefined {
	if (counts.errorCount > 0) return "error"
	if (counts.warningCount > 0) return "warn"
	if (counts.infoCount > 0) return "info"
	return undefined
}

function formatSummaryLine(counts: {
	errorCount: number
	warningCount: number
	infoCount: number
}): string {
	const problems = counts.errorCount + counts.warningCount + counts.infoCount

	if (problems === 0) {
		// \u2714 is Heavy Check Mark
		return chalk.green("\u2714 0 problems")
	}

	const parts: string[] = []
	parts.push(`${counts.errorCount} error${counts.errorCount === 1 ? "" : "s"}`)
	parts.push(
		`${counts.warningCount} warning${counts.warningCount === 1 ? "" : "s"}`,
	)

	if (counts.infoCount > 0) {
		parts.push(`${counts.infoCount} info`)
	}

	// \u2716 is Heavy Multiplication X
	const summary = `\u2716 ${problems} problem${problems === 1 ? "" : "s"} (${parts.join(", ")})`

	const highest = highestSeverityForCounts(counts)
	return highest ? colorForSeverity(highest)(summary) : summary
}

type TargetInfo = {
	viewName?: string
	optionNames: string[]
	scopeNames: string[]
	optionCount: number
	scopeCount: number
	baseURL?: string
}

const collectNames = (
	values: Array<{ meta?: { name?: string } }>,
): string[] => {
	const names = values
		.map((value) => value.meta?.name)
		.filter((name): name is string => Boolean(name))
	return [...new Set(names)]
}

const resolveBaseURL = (target?: Target): string | undefined => {
	if (!target) return undefined
	const layers = concatSetupOptsLayers(toArray(target.options))
	if (layers.length === 0) return undefined
	return mergeSetupOptsLayers(layers).context?.baseURL
}

function getTargetInfo(result: LintResult): TargetInfo {
	const target = result.target
	if (!target) {
		return {
			optionNames: [],
			scopeNames: [],
			optionCount: 0,
			scopeCount: 0,
		}
	}

	const options = toArray(target.options)
	const scopes = toArray(target.scope)

	return {
		viewName: target.view.meta?.name,
		optionNames: collectNames(options),
		scopeNames: collectNames(scopes),
		optionCount: options.length,
		scopeCount: scopes.length,
		baseURL: resolveBaseURL(target),
	}
}

function collectTargetDetails(info: TargetInfo): string[] {
	const details: string[] = []
	const hasNamed = info.optionNames.length > 0 || info.scopeNames.length > 0
	if (!hasNamed) return details

	const scopeUnnamedCount = info.scopeCount - info.scopeNames.length
	if (info.scopeCount > 0) {
		const scopeNameText = info.scopeNames.join(", ")
		const suffix =
			scopeUnnamedCount > 0 ? ` (+${scopeUnnamedCount} unnamed)` : ""
		const value = scopeNameText.length > 0 ? ` ${scopeNameText}` : ""
		details.push(` scopes:${value}${suffix}`.trim())
	}

	const optionUnnamedCount = info.optionCount - info.optionNames.length
	if (info.optionCount > 0) {
		const optionNameText = info.optionNames.join(", ")
		const suffix =
			optionUnnamedCount > 0 ? ` (+${optionUnnamedCount} unnamed)` : ""
		const value = optionNameText.length > 0 ? ` ${optionNameText}` : ""
		details.push(` options:${value}${suffix}`.trim())
	}

	return details
}

function formatTargetHeader(result: LintResult, info: TargetInfo): string {
	const baseLabel = info.baseURL ?? result.url
	const hasNamed = info.optionNames.length > 0 || info.scopeNames.length > 0
	const optionUnnamedCount = info.optionCount - info.optionNames.length
	const scopeUnnamedCount = info.scopeCount - info.scopeNames.length
	const hasOnlyUnnamed =
		!hasNamed && (optionUnnamedCount > 0 || scopeUnnamedCount > 0)

	// if there is a view name
	if (info.viewName) {
		const viewLabel = info.baseURL
			? `${info.viewName} ${chalk.gray(`(${info.baseURL})`)}`
			: info.viewName
		if (!hasOnlyUnnamed) return viewLabel
		
		// if there aren't any named options/scopes just show their counts inline
		const countParts: string[] = []
		if (optionUnnamedCount > 0) {
			countParts.push(
				`${optionUnnamedCount} option${optionUnnamedCount === 1 ? "" : "s"}`,
			)
		}
		if (scopeUnnamedCount > 0) {
			countParts.push(
				`${scopeUnnamedCount} scope${scopeUnnamedCount === 1 ? "" : "s"}`,
			)
		}
		return `${viewLabel} ${chalk.gray(`(${countParts.join(", ")})`)}`
	}

	// if there isn't a view name
	const countParts: string[] = []
	// if there aren't any named options/scopes just show their counts inline
	if (hasOnlyUnnamed) {
		if (optionUnnamedCount > 0) {
			countParts.push(
				`${optionUnnamedCount} option${optionUnnamedCount === 1 ? "" : "s"}`,
			)
		}
		if (scopeUnnamedCount > 0) {
			countParts.push(
				`${scopeUnnamedCount} scope${scopeUnnamedCount === 1 ? "" : "s"}`,
			)
		}
		return `${baseLabel} ${chalk.gray(`(${countParts.join(", ")})`)}`
	}

	return baseLabel
}

export function formatStylish(results: LintResult[]): string {
	const lines: string[] = []

	let errorCount = 0
	let warningCount = 0
	let infoCount = 0

	for (const result of results) {
		const targetInfo = getTargetInfo(result)
		const header = formatTargetHeader(result, targetInfo)
		lines.push(chalk.underline(header))

		const details = collectTargetDetails(targetInfo)
		if (details.length > 0) {
			for (const detail of details) {
				lines.push(chalk.gray(`- ${detail}`))
			}
		}
		lines.push("")

		const sorted = sortMessages(result.messages)
		for (const msg of sorted) {
			lines.push(
				`  ${chalk.dim("[")}${formatSeverityLabel(msg.severity)}${chalk.dim("]")} ${chalk.bold(
					msg.ruleId,
				)}${chalk.dim(":")} ${msg.message}`,
			)

			lines.push(`    ${formatElementInline(msg.location.element)}`)

			if (msg.relations.length > 0) {
				lines.push(`    ${chalk.dim("Related:")}`)

				for (const relation of msg.relations) {
					lines.push(
						`      ${chalk.dim("-")} ${relation.description}: ${formatElementInline(
							relation.location.element,
						)}`,
					)
				}
			}

			lines.push("")
		}

		lines.push("")

		errorCount += result.errorCount
		warningCount += result.warningCount
		infoCount += result.infoCount
	}

	lines.push(formatSummaryLine({ errorCount, warningCount, infoCount }))

	return `${lines.join("\n")}\n`
}
