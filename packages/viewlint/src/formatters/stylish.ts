import chalk from "chalk"

import type {
	ElementDescriptor,
	LintMessage,
	LintResult,
	ReportSeverity,
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
		return chalk.green("\u2716 0 problems")
	}

	const parts: string[] = []
	parts.push(`${counts.errorCount} error${counts.errorCount === 1 ? "" : "s"}`)
	parts.push(
		`${counts.warningCount} warning${counts.warningCount === 1 ? "" : "s"}`,
	)

	if (counts.infoCount > 0) {
		parts.push(`${counts.infoCount} info`)
	}

	const summary = `\u2716 ${problems} problem${problems === 1 ? "" : "s"} (${parts.join(", ")})`

	const highest = highestSeverityForCounts(counts)
	return highest ? colorForSeverity(highest)(summary) : summary
}

export function formatStylish(results: LintResult[]): string {
	const lines: string[] = []

	let errorCount = 0
	let warningCount = 0
	let infoCount = 0

	for (const result of results) {
		lines.push(chalk.underline(result.url))

		const sorted = sortMessages(result.messages)
		for (const msg of sorted) {
			lines.push(
				`  ${chalk.dim("[")}${formatSeverityLabel(msg.severity)}${chalk.dim("]")} ${chalk.bold(
					msg.ruleId,
				)} ${msg.message}`,
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
