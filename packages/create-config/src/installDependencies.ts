import { spawnSync } from "node:child_process"
import fs from "node:fs/promises"
import path from "node:path"

import type { PackageManager } from "./promptForSetupPlan.js"

type InstallCommand = {
	command: string
	args: string[]
}

export type SpawnSyncLike = (
	command: string,
	args: string[],
	options: {
		cwd: string
		encoding: "utf8"
		stdio: "inherit"
	},
) => { status: number | null; error?: unknown }

function getPlatformCommand(
	command: string,
	platform: NodeJS.Platform,
): string {
	if (platform !== "win32") return command
	return `${command}.cmd`
}

export function getInstallCommand(opts: {
	packageManager: PackageManager
	dependencies: readonly string[]
}): InstallCommand {
	const deps = [...opts.dependencies]

	if (opts.packageManager === "npm") {
		return { command: "npm", args: ["install", "--save-dev", ...deps] }
	}

	if (opts.packageManager === "yarn") {
		return { command: "yarn", args: ["add", "--dev", ...deps] }
	}

	if (opts.packageManager === "pnpm") {
		return { command: "pnpm", args: ["add", "--save-dev", ...deps] }
	}

	if (opts.packageManager === "bun") {
		return { command: "bun", args: ["add", "--dev", ...deps] }
	}

	const _exhaustive: never = opts.packageManager
	throw new Error(`Unsupported package manager: ${_exhaustive}`)
}

async function assertHasPackageJson(
	cwd: string,
	stat: (filePath: string) => Promise<{ isFile(): boolean }>,
): Promise<void> {
	const packageJsonPath = path.join(cwd, "package.json")
	try {
		const stats = await stat(packageJsonPath)
		if (!stats.isFile()) {
			throw new Error(`Expected ${packageJsonPath} to be a file.`)
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		throw new Error(
			`Cannot install dependencies because no package.json was found at ${packageJsonPath}. (${message})`,
		)
	}
}

export async function installDependencies(opts: {
	cwd: string
	packageManager: PackageManager
	dependencies: readonly string[]
	runtime?: {
		platform?: NodeJS.Platform
		spawnSync?: SpawnSyncLike
		stat?: (filePath: string) => Promise<{ isFile(): boolean }>
	}
}): Promise<number> {
	const platform = opts.runtime?.platform ?? process.platform
	const spawn = opts.runtime?.spawnSync ?? spawnSync
	const stat = opts.runtime?.stat ?? fs.stat

	await assertHasPackageJson(opts.cwd, stat)

	const install = getInstallCommand({
		packageManager: opts.packageManager,
		dependencies: opts.dependencies,
	})

	process.stdout.write(
		`Installing dev dependencies using ${opts.packageManager}: ${opts.dependencies.join(
			", ",
		)}\n`,
	)

	const result = spawn(
		getPlatformCommand(install.command, platform),
		install.args,
		{
			cwd: opts.cwd,
			encoding: "utf8",
			stdio: "inherit",
		},
	)

	if (result.error) {
		const message =
			result.error instanceof Error
				? result.error.message
				: String(result.error)
		process.stderr.write(`${message}\n`)
		return 1
	}

	return result.status ?? 1
}
