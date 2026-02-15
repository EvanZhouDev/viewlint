import { spawnSync } from "node:child_process"
import { constants } from "node:fs"
import { access as accessFile } from "node:fs/promises"
import { createRequire } from "node:module"
import path from "node:path"
import { pathToFileURL } from "node:url"

import type { SpawnSyncLike } from "./installDependencies.js"
import type { PackageManager } from "./promptForSetupPlan.js"

type InstallCommand = {
	command: string
	args: string[]
}

const require = createRequire(import.meta.url)

function getPlatformCommand(
	command: string,
	platform: NodeJS.Platform,
): string {
	if (platform !== "win32") return command
	return `${command}.cmd`
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null
}

function hasExecutablePath(
	value: unknown,
): value is { executablePath(): string } {
	return isRecord(value) && typeof value.executablePath === "function"
}

export function getPlaywrightChromiumInstallCommand(opts: {
	packageManager: PackageManager | null
}): InstallCommand {
	if (opts.packageManager === null) {
		return {
			command: "npx",
			args: ["playwright", "install", "chromium"],
		}
	}

	if (opts.packageManager === "npm") {
		return {
			command: "npm",
			args: ["exec", "playwright", "install", "chromium"],
		}
	}

	if (opts.packageManager === "yarn") {
		return {
			command: "yarn",
			args: ["playwright", "install", "chromium"],
		}
	}

	if (opts.packageManager === "pnpm") {
		return {
			command: "pnpm",
			args: ["exec", "playwright", "install", "chromium"],
		}
	}

	if (opts.packageManager === "bun") {
		return {
			command: "bun",
			args: ["x", "playwright", "install", "chromium"],
		}
	}

	const _exhaustive: never = opts.packageManager
	throw new Error(`Unsupported package manager: ${_exhaustive}`)
}

export function formatPlaywrightChromiumInstallCommand(opts: {
	packageManager: PackageManager | null
}): string {
	const command = getPlaywrightChromiumInstallCommand(opts)
	return [command.command, ...command.args].join(" ")
}

function resolvePlaywrightFromCwd(cwd: string): string {
	try {
		return require.resolve("playwright", { paths: [cwd] })
	} catch {
		const viewlintPackageJsonPath = require.resolve("viewlint/package.json", {
			paths: [cwd],
		})
		return require.resolve("playwright", {
			paths: [path.dirname(viewlintPackageJsonPath)],
		})
	}
}

function getPlaywrightChromium(
	moduleValue: unknown,
): { executablePath(): string } | null {
	if (!isRecord(moduleValue)) return null

	const defaultExport = moduleValue.default
	const playwright = isRecord(defaultExport) ? defaultExport : moduleValue
	const chromiumValue = playwright.chromium ?? moduleValue.chromium
	if (!hasExecutablePath(chromiumValue)) return null

	return { executablePath: chromiumValue.executablePath }
}

export async function isPlaywrightChromiumInstalled(opts: {
	cwd: string
	runtime?: {
		resolvePlaywright?: (cwd: string) => string
		importModule?: (specifier: string) => Promise<unknown>
		access?: (filePath: string, mode: number) => Promise<void>
	}
}): Promise<boolean> {
	const resolvePlaywright =
		opts.runtime?.resolvePlaywright ?? resolvePlaywrightFromCwd
	const importModule =
		opts.runtime?.importModule ?? ((specifier: string) => import(specifier))
	const access = opts.runtime?.access ?? accessFile

	let playwrightPath: string
	try {
		playwrightPath = resolvePlaywright(opts.cwd)
	} catch {
		return false
	}

	let playwrightModule: unknown
	try {
		playwrightModule = await importModule(pathToFileURL(playwrightPath).href)
	} catch {
		return false
	}

	const chromium = getPlaywrightChromium(playwrightModule)
	if (!chromium) return false

	let executablePath: string
	try {
		executablePath = chromium.executablePath()
	} catch {
		return false
	}

	if (!executablePath) return false

	try {
		await access(executablePath, constants.X_OK)
		return true
	} catch {
		return false
	}
}

export async function installPlaywrightChromium(opts: {
	cwd: string
	packageManager: PackageManager | null
	runtime?: {
		platform?: NodeJS.Platform
		spawnSync?: SpawnSyncLike
	}
}): Promise<number> {
	const platform = opts.runtime?.platform ?? process.platform
	const spawn = opts.runtime?.spawnSync ?? spawnSync

	const install = getPlaywrightChromiumInstallCommand({
		packageManager: opts.packageManager,
	})

	process.stdout.write(
		`Installing Playwright Chromium using ${install.command}.\n`,
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
