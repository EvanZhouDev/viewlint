import fs from "node:fs/promises"
import path from "node:path"

import { Command, Option } from "commander"

import { ViewLint } from "./index.js"
import type { LintMessage, LintResult, LoadedFormatter } from "./types.js"

type ParsedCliOptions = {
	config?: string

	format: string
	outputFile?: string

	quiet: boolean
	maxWarnings: number

	help: boolean
	version: boolean
}

type SeverityCounts = {
	errorCount: number
	warningCount: number
	infoCount: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null
}

function parseIntStrict(raw: string): number {
	const parsed = Number(raw)

	if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
		throw new Error(`Expected an integer but got '${raw}'.`)
	}

	return parsed
}

function countSeverities(messages: LintMessage[]): SeverityCounts {
	let errorCount = 0
	let warningCount = 0
	let infoCount = 0

	for (const message of messages) {
		if (message.severity === "error") errorCount += 1
		if (message.severity === "warn") warningCount += 1
		if (message.severity === "info") infoCount += 1
	}

	return { errorCount, warningCount, infoCount }
}

function sumCounts(
	results: LintResult[],
): Pick<SeverityCounts, "errorCount" | "warningCount"> {
	let errorCount = 0
	let warningCount = 0

	for (const result of results) {
		errorCount += result.errorCount
		warningCount += result.warningCount
	}

	return { errorCount, warningCount }
}

function computeExitCode(
	counts: { errorCount: number; warningCount: number },
	maxWarnings: number,
): 0 | 1 {
	const tooManyWarnings = maxWarnings >= 0 && counts.warningCount > maxWarnings
	return counts.errorCount > 0 || tooManyWarnings ? 1 : 0
}

async function isDirectory(filePath: string): Promise<boolean> {
	try {
		return (await fs.stat(filePath)).isDirectory()
	} catch (error) {
		if (
			isRecord(error) &&
			"code" in error &&
			typeof error.code === "string" &&
			(error.code === "ENOENT" || error.code === "ENOTDIR")
		) {
			return false
		}

		throw error
	}
}

async function writeOrStdout(
	output: string,
	outputFile: string | undefined,
): Promise<void> {
	if (!outputFile) {
		process.stdout.write(output)
		return
	}

	const filePath = path.resolve(process.cwd(), outputFile)

	if (await isDirectory(filePath)) {
		throw new Error(
			`Cannot write to output file path, it is a directory: ${outputFile}`,
		)
	}

	await fs.mkdir(path.dirname(filePath), { recursive: true })
	await fs.writeFile(filePath, output, "utf8")
}

type HelpItem = {
	section: string
	flags: string
	description: string
}

const HELP_ITEMS: HelpItem[] = [
	{
		section: "Basic configuration",
		flags: "-c, --config path::String",
		description:
			"Use this configuration instead of viewlint.config.ts, viewlint.config.mjs, or viewlint.config.js",
	},
	{
		section: "Handle Warnings",
		flags: "--quiet",
		description: "Report errors only - default: false",
	},
	{
		section: "Handle Warnings",
		flags: "--max-warnings Int",
		description:
			"Number of warnings to trigger nonzero exit code - default: -1",
	},
	{
		section: "Output",
		flags: "-o, --output-file path::String",
		description: "Specify file to write report to",
	},
	{
		section: "Output",
		flags: "-f, --format String",
		description: "Use a specific output format - default: stylish",
	},
	{
		section: "Miscellaneous",
		flags: "--init",
		description:
			"Run config initialization wizard - default: false (coming soon)",
	},
	{
		section: "Miscellaneous",
		flags: "--mcp",
		description: "Start the ViewLint MCP server (coming soon)",
	},
	{
		section: "Miscellaneous",
		flags: "-h, --help",
		description: "Show help",
	},
	{
		section: "Miscellaneous",
		flags: "-v, --version",
		description: "Output the version number",
	},
]

function renderHelp(): string {
	const colWidth = HELP_ITEMS.reduce((max, item) => {
		return Math.max(max, item.flags.length)
	}, 0)

	const sections = new Map<string, HelpItem[]>()
	for (const item of HELP_ITEMS) {
		const existing = sections.get(item.section)
		if (existing) {
			existing.push(item)
		} else {
			sections.set(item.section, [item])
		}
	}

	const lines: string[] = []
	lines.push("viewlint [options] <url> [url]", "")

	for (const [section, items] of sections.entries()) {
		lines.push(`${section}:`)
		for (const item of items) {
			lines.push(`  ${item.flags.padEnd(colWidth)}  ${item.description}`)
		}
		lines.push("")
	}

	return `${lines.join("\n")}\n`
}

function createProgram(): Command {
	const program = new Command()

	program
		.name("viewlint")
		.usage("[options] <url> [url]")
		.allowUnknownOption(false)
		.allowExcessArguments(true)

	// Disable Commander built-in help/version output.
	program.helpOption(false)

	// Avoid duplicated output: we print errors/help/version ourselves.
	program.configureOutput({
		writeOut() {},
		writeErr() {},
	})

	program
		.addOption(new Option("-c, --config <path>"))
		.addOption(new Option("--quiet").default(false))
		.addOption(
			new Option("--max-warnings <n>").argParser(parseIntStrict).default(-1),
		)
		.addOption(new Option("-o, --output-file <path>"))
		.addOption(new Option("-f, --format <format>").default("stylish"))
		.addOption(new Option("-h, --help").default(false))
		.addOption(new Option("-v, --version").default(false))

	return program
}

async function readPackageVersion(): Promise<string> {
	const url = new URL("../package.json", import.meta.url)
	const raw = await fs.readFile(url, "utf8")
	const parsed: unknown = JSON.parse(raw)

	if (!isRecord(parsed) || typeof parsed.version !== "string") {
		throw new Error(
			"packages/viewlint/package.json must include a string 'version' field for --version.",
		)
	}

	return parsed.version
}

function filterResultsForQuietMode(results: LintResult[]): LintResult[] {
	return results.map((result) => {
		const messages = result.messages.filter((m) => m.severity === "error")
		const counts = countSeverities(messages)

		return {
			...result,
			messages,
			suppressedMessages: [],
			errorCount: counts.errorCount,
			warningCount: 0,
			infoCount: 0,
			recommendCount: 0,
		}
	})
}

async function execute(
	options: ParsedCliOptions,
	urls: string[],
): Promise<number> {
	if (urls.length === 0) {
		process.stderr.write(
			"No URLs provided.\n\nPass one or more URLs, e.g. `viewlint https://example.com`.\n",
		)
		return 2
	}

	const viewlint = new ViewLint({
		overrideConfigFile: options.config,
	})

	let results: LintResult[]
	try {
		results = await viewlint.lintUrls(urls)
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		process.stderr.write(`${message}\n`)
		return 2
	}

	const resultsForPrinting = options.quiet
		? filterResultsForQuietMode(results)
		: results

	let formatter: LoadedFormatter
	try {
		formatter = await viewlint.loadFormatter(options.format)
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		process.stderr.write(`${message}\n`)
		return 2
	}

	try {
		const output = await formatter.format(resultsForPrinting)
		await writeOrStdout(output, options.outputFile)
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		process.stderr.write(`${message}\n`)
		return 2
	}

	const counts = sumCounts(results)
	return computeExitCode(counts, options.maxWarnings)
}

function isCommanderError(
	value: unknown,
): value is { exitCode: number; message: string } {
	if (!isRecord(value)) return false
	return typeof value.exitCode === "number" && typeof value.message === "string"
}

export async function runCli(argv: string[]): Promise<number> {
	const program = createProgram()

	program.exitOverride()

	try {
		program.parse(argv)
	} catch (error) {
		if (isCommanderError(error)) {
			process.stderr.write(`${error.message}\n`)
			return 2
		}

		const message = error instanceof Error ? error.message : String(error)
		process.stderr.write(`${message}\n`)
		return 2
	}

	const opts = program.opts<ParsedCliOptions>()
	const urls = program.args

	if (opts.help) {
		process.stdout.write(renderHelp())
		return 0
	}

	if (opts.version) {
		try {
			process.stdout.write(`${await readPackageVersion()}\n`)
			return 0
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			process.stderr.write(`${message}\n`)
			return 2
		}
	}

	return await execute(opts, urls)
}
