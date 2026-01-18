import type {
	ElementDescriptor,
	LintMessage,
	LintResult,
	LoadedFormatter,
	ReportSeverity,
} from "./types.js"

const SEVERITY_SORT_WEIGHT: Record<ReportSeverity, number> = {
	error: 0,
	warn: 1,
	info: 2,
}

function severityComparator(a: ReportSeverity, b: ReportSeverity): number {
	return SEVERITY_SORT_WEIGHT[a] - SEVERITY_SORT_WEIGHT[b]
}

function formatElementDescriptor(element: ElementDescriptor): string {
	let identity = element.tagName
	if (element.id) identity += `#${element.id}`

	const classPart = element.classes
		.map((className) => className.trim())
		.filter((className) => className.length > 0)
		.slice(0, 4)
		.join(".")

	if (classPart) identity += `.${classPart}`
	return `<${identity}> selector(${element.selector})`
}

function sortMessages(messages: LintMessage[]): LintMessage[] {
	return [...messages].sort((a, b) => {
		const delta = severityComparator(a.severity, b.severity)
		if (delta !== 0) return delta

		return a.message.localeCompare(b.message)
	})
}

function formatStylish(results: LintResult[]): string {
	const lines: string[] = []

	let errorCount = 0
	let warningCount = 0
	let infoCount = 0

	for (const result of results) {
		lines.push(result.url)

		const sorted = sortMessages(result.messages)
		for (const msg of sorted) {
			lines.push(
				`  [${msg.severity}] ${msg.message} (${formatElementDescriptor(
					msg.location.element,
				)})`,
			)

			for (const relation of msg.relations) {
				lines.push(
					`    - ${relation.description} (${formatElementDescriptor(
						relation.location.element,
					)})`,
				)
			}
		}

		lines.push("")

		errorCount += result.errorCount
		warningCount += result.warningCount
		infoCount += result.infoCount
	}

	const summaryParts: string[] = []
	if (errorCount > 0)
		summaryParts.push(`${errorCount} error${errorCount === 1 ? "" : "s"}`)
	if (warningCount > 0)
		summaryParts.push(`${warningCount} warning${warningCount === 1 ? "" : "s"}`)
	if (infoCount > 0) summaryParts.push(`${infoCount} info`)

	lines.push(summaryParts.length === 0 ? "0 problems" : summaryParts.join(", "))

	return `${lines.join("\n")}\n`
}

export function formatterFromId(id: string | undefined): LoadedFormatter {
	const normalized = (id ?? "stylish").trim()

	if (normalized === "stylish") {
		return { format: formatStylish }
	}

	if (normalized === "json") {
		return {
			format(results) {
				return `${JSON.stringify(results, null, 2)}\n`
			},
		}
	}

	throw new Error(
		`Unknown formatter '${normalized}'. Supported: 'stylish', 'json'.`,
	)
}
