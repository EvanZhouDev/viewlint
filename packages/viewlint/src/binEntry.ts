import fs from "node:fs";
import { fileURLToPath } from "node:url";

type SpawnSyncOptions = {
	encoding: "utf8";
	stdio: "inherit";
};

type SpawnSyncResult = {
	status?: unknown;
};

type SpawnSync = (
	command: string,
	args: string[],
	options: SpawnSyncOptions,
) => unknown;

type RunCli = (argv: string[]) => Promise<number>;

type EnableDebug = (namespaces: string) => void;

type BinDeps = {
	spawnSync: SpawnSync;
	runCli: RunCli;
	enableDebug: EnableDebug;
	writeStdout: (text: string) => void;
	writeStderr: (text: string) => void;
	fileExists: (filePath: string) => boolean;
};

function isSpawnSyncResult(value: unknown): value is SpawnSyncResult {
	return typeof value === "object" && value !== null;
}

function coerceExitCode(result: unknown): number {
	if (!isSpawnSyncResult(result)) return 1;
	if (typeof result.status !== "number") return 1;
	if (!Number.isFinite(result.status)) return 1;
	return result.status;
}

export async function runBin(argv: string[], deps: BinDeps): Promise<number> {
	// Keep this entrypoint extremely lightweight, similar to ESLint.
	// We intentionally scan argv for early flags instead of doing full parse.
	if (argv.includes("--init")) {
		deps.writeStderr(
			"You can also run this command directly using 'npx @viewlint/create-config@latest'.\n",
		);

		const result = deps.spawnSync("npx", ["@viewlint/create-config@latest"], {
			encoding: "utf8",
			stdio: "inherit",
		});
		return coerceExitCode(result);
	}

	if (argv.includes("--mcp")) {
		deps.writeStderr(
			"You can also run this command directly using 'npx @viewlint/mcp@latest'.\n",
		);

		const result = deps.spawnSync("npx", ["@viewlint/mcp@latest"], {
			encoding: "utf8",
			stdio: "inherit",
		});
		return coerceExitCode(result);
	}

	if (argv.includes("--verbose")) {
		deps.enableDebug("viewlint*");
	}

	return deps.runCli(argv);
}

export function createDefaultBinDeps(opts: {
	spawnSync: SpawnSync;
	runCli: RunCli;
	enableDebug: EnableDebug;
}): BinDeps {
	return {
		spawnSync: opts.spawnSync,
		runCli: opts.runCli,
		enableDebug: opts.enableDebug,
		writeStdout: (text) => process.stdout.write(text),
		writeStderr: (text) => process.stderr.write(text),
		fileExists: (filePath) => fs.existsSync(filePath),
	};
}
