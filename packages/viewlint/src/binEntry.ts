import fs from "node:fs"
import { fileURLToPath } from "node:url"

type SpawnSyncOptions = {
	encoding: "utf8"
	stdio: "inherit"
}

type SpawnSyncResult = {
	status?: unknown
}

type SpawnSync = (
	command: string,
	args: string[],
	options: SpawnSyncOptions,
) => unknown

type RunCli = (argv: string[]) => Promise<number>

type EnableDebug = (namespaces: string) => void

type BinDeps = {
	spawnSync: SpawnSync
	runCli: RunCli
	enableDebug: EnableDebug
	writeStdout: (text: string) => void
	writeStderr: (text: string) => void
	fileExists: (filePath: string) => boolean
}

const LOCAL_MCP_CLI_PATH = fileURLToPath(
	new URL("../../mcp/src/mcp-cli.ts", import.meta.url),
)
const LOCAL_CREATE_CONFIG_CLI_PATH = fileURLToPath(
	new URL("../../create-config/bin/create-config.js", import.meta.url),
)

function isSpawnSyncResult(value: unknown): value is SpawnSyncResult {
	return typeof value === "object" && value !== null
}

function coerceExitCode(result: unknown): number {
	if (!isSpawnSyncResult(result)) return 1
	if (typeof result.status !== "number") return 1
	if (!Number.isFinite(result.status)) return 1
	return result.status
}

function runNpxCommandWithLocalFallback(opts: {
	deps: BinDeps
	packageName: string
	localCliPath: string
	localToolName: string
}): number {
	opts.deps.writeStderr(
		`You can also run this command directly using 'npx ${opts.packageName}'.\n`,
	)

	const result = opts.deps.spawnSync("npx", [opts.packageName], {
		encoding: "utf8",
		stdio: "inherit",
	})
	const remoteExitCode = coerceExitCode(result)
	if (remoteExitCode === 0) {
		return 0
	}

	if (opts.deps.fileExists(opts.localCliPath)) {
		opts.deps.writeStderr(
			`Falling back to local ${opts.localToolName} CLI at '${opts.localCliPath}'.\n`,
		)

		const fallback = opts.deps.spawnSync("bun", [opts.localCliPath], {
			encoding: "utf8",
			stdio: "inherit",
		})

		return coerceExitCode(fallback)
	}

	return remoteExitCode
}

export async function runBin(argv: string[], deps: BinDeps): Promise<number> {
	// Keep this entrypoint extremely lightweight, similar to ESLint.
	// We intentionally scan argv for early flags instead of doing full parse.
	if (argv.includes("--init")) {
		return runNpxCommandWithLocalFallback({
			deps,
			packageName: "@viewlint/create-config@latest",
			localCliPath: LOCAL_CREATE_CONFIG_CLI_PATH,
			localToolName: "create-config",
		})
	}

	if (argv.includes("--mcp")) {
		return runNpxCommandWithLocalFallback({
			deps,
			packageName: "@viewlint/mcp@latest",
			localCliPath: LOCAL_MCP_CLI_PATH,
			localToolName: "MCP",
		})
	}

	if (argv.includes("--verbose")) {
		deps.enableDebug("viewlint*")
	}

	return deps.runCli(argv)
}

export function createDefaultBinDeps(opts: {
	spawnSync: SpawnSync
	runCli: RunCli
	enableDebug: EnableDebug
}): BinDeps {
	return {
		spawnSync: opts.spawnSync,
		runCli: opts.runCli,
		enableDebug: opts.enableDebug,
		writeStdout: (text) => process.stdout.write(text),
		writeStderr: (text) => process.stderr.write(text),
		fileExists: (filePath) => fs.existsSync(filePath),
	}
}
