import fs from "node:fs/promises"
import path from "node:path"

import { Command, InvalidArgumentError } from "commander"

import { ViewLint } from "./index.js"
import type { LintMessage, LintResult, LoadedFormatter } from "./types.js"

type CliOptions = {
	config?: string
	format: string
	outputFile?: string
	quiet: boolean
	maxWarnings: number
	verbose: boolean

	// Parsed for help text completeness, but handled by the bin entrypoint.
	init?: boolean
	mcp?: boolean
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
		throw new InvalidArgumentError(`Expected an integer but got '${raw}'.`)
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

async function execute(options: CliOptions, urls: string[]): Promise<number> {
	if (urls.length === 0) {
		process.stderr.write(
			"No URLs provided.\n\nPass one or more URLs, e.g. `viewlint https://example.com`.\n",
		)
		return 2
	}

	const viewlint = new ViewLint({
		overrideConfigFile: options.config,
		debug: {
			verbose: options.verbose,
		},
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

function isCommanderError(value: unknown): value is { exitCode: number } {
	return isRecord(value) && typeof value.exitCode === "number"
}

export async function runCli(argv: string[]): Promise<number> {
	const version = await readPackageVersion()
	let exitCode: number = 0

	const program = new Command()
	program
		.name("viewlint")
		.description("Lint accessibility and UI issues on web pages")
		.usage("[options] <url> [url]")
		.argument("[url...]", "One or more URLs to lint")
		.showHelpAfterError()
		.allowUnknownOption(false)

	// Help group headings are part of the Commander-native help output.
	program
		.optionsGroup("Basic configuration:")
		.option(
			"-c, --config <path>",
			"Use this configuration instead of viewlint.config.ts, viewlint.config.mjs, or viewlint.config.js",
		)

	program
		.optionsGroup("Handle Warnings:")
		.option("--quiet", "Report errors only", false)
		.option(
			"--max-warnings <n>",
			"Number of warnings to trigger nonzero exit code",
			parseIntStrict,
			-1,
		)

	program
		.optionsGroup("Output:")
		.option("-f, --format <format>", "Use a specific output format", "stylish")
		.option("-o, --output-file <path>", "Specify file to write report to")

	program
		.optionsGroup("Miscellaneous:")
		.option("--verbose", "Log progress details to stderr", false)
		.option("--init", "Run config initialization wizard (coming soon)", false)
		.option("--mcp", "Start the ViewLint MCP server (coming soon)", false)
		.version(version, "-v, --version", "Output the version number")
		.helpOption("-h, --help", "Show help")

	program.action(async (urls: string[], options: CliOptions) => {
		exitCode = await execute(options, urls)
	})

	program.exitOverride()

	try {
		await program.parseAsync(argv)
		return exitCode
	} catch (error) {
		if (isCommanderError(error)) {
			return error.exitCode === 0 ? 0 : 2
		}

		const message = error instanceof Error ? error.message : String(error)
		process.stderr.write(`${message}\n`)
		return 2
	}
}
