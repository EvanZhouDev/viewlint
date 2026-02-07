import fs from "node:fs"
import path from "node:path"

import * as p from "@clack/prompts"

export type ConfigPreset = "recommended" | "all"
export type ConfigLanguage = "typescript" | "javascript"
export type PackageManager = "npm" | "yarn" | "pnpm" | "bun"

export type SetupPlan = {
	preset: ConfigPreset
	language: ConfigLanguage
	dependencies: readonly string[]
	installNow: boolean
	createPackageJson: boolean
	packageManager: PackageManager | null
}

const REQUIRED_DEPENDENCIES: readonly string[] = ["viewlint", "@viewlint/rules"]

export function getRequiredDependencies(): readonly string[] {
	return [...REQUIRED_DEPENDENCIES]
}

function parseConfigPreset(value: unknown): ConfigPreset {
	if (value === "recommended" || value === "all") return value
	throw new Error(`Unexpected preset selection: ${String(value)}`)
}

function parseConfigLanguage(value: unknown): ConfigLanguage {
	if (value === "typescript" || value === "javascript") return value
	throw new Error(`Unexpected language selection: ${String(value)}`)
}

function parsePackageManager(value: unknown): PackageManager {
	if (
		value === "npm" ||
		value === "yarn" ||
		value === "pnpm" ||
		value === "bun"
	) {
		return value
	}
	throw new Error(`Unexpected package manager selection: ${String(value)}`)
}

function parseConfirm(value: unknown): boolean {
	if (value === true || value === false) return value
	throw new Error(`Unexpected confirmation value: ${String(value)}`)
}

function detectPackageManagerFromLockfiles(cwd: string): PackageManager | null {
	const candidates: Array<{ pm: PackageManager; file: string }> = [
		{ pm: "bun", file: "bun.lockb" },
		{ pm: "bun", file: "bun.lock" },
		{ pm: "pnpm", file: "pnpm-lock.yaml" },
		{ pm: "yarn", file: "yarn.lock" },
		{ pm: "npm", file: "package-lock.json" },
		{ pm: "npm", file: "npm-shrinkwrap.json" },
	]

	for (const { pm, file } of candidates) {
		if (fs.existsSync(path.join(cwd, file))) return pm
	}

	return null
}

function formatDependencyList(deps: readonly string[]): string {
	return deps.join(", ")
}

export async function promptForSetupPlan(opts: {
	cwd: string
}): Promise<SetupPlan | null> {
	p.intro("ViewLint config")

	const presetRaw = await p.select({
		message: "How would you like to configure ViewLint?",
		options: [
			{
				value: "recommended",
				label: "Base rules (Recommended)",
				hint: "@viewlint/rules:recommended",
			},
			{
				value: "all",
				label: "All rules (Best for AI Agents)",
				hint: "@viewlint/rules:all",
			},
		],
		initialValue: "recommended",
	})

	if (p.isCancel(presetRaw)) {
		p.cancel("Setup cancelled.")
		return null
	}

	const preset: ConfigPreset = parseConfigPreset(presetRaw)

	const languageRaw = await p.select({
		message:
			"What language do you want your configuration file to be written in?",
		options: [
			{ value: "typescript", label: "TypeScript" },
			{ value: "javascript", label: "JavaScript" },
		],
		initialValue: "typescript",
	})

	if (p.isCancel(languageRaw)) {
		p.cancel("Setup cancelled.")
		return null
	}

	const language: ConfigLanguage = parseConfigLanguage(languageRaw)
	const dependencies = getRequiredDependencies()

	const installNowRaw = await p.confirm({
		message: `The config you've selected requires the following dependencies: ${formatDependencyList(
			dependencies,
		)}. Would you like to install them now?`,
		initialValue: true,
	})

	if (p.isCancel(installNowRaw)) {
		p.cancel("Setup cancelled.")
		return null
	}

	const installNow = parseConfirm(installNowRaw)

	if (!installNow) {
		p.outro("Config selection complete.")
		return {
			preset,
			language,
			dependencies,
			installNow,
			createPackageJson: false,
			packageManager: null,
		}
	}

	const packageJsonPath = path.join(opts.cwd, "package.json")
	const hasPackageJson = fs.existsSync(packageJsonPath)
	let createPackageJson = false

	if (!hasPackageJson) {
		const createPackageJsonRaw = await p.confirm({
			message:
				"No package.json was found in this directory. Create one now? (required to install dependencies)",
			initialValue: true,
		})

		if (p.isCancel(createPackageJsonRaw)) {
			p.cancel("Setup cancelled.")
			return null
		}

		createPackageJson = parseConfirm(createPackageJsonRaw)
		if (!createPackageJson) {
			p.outro("Config selection complete.")
			return {
				preset,
				language,
				dependencies,
				installNow: false,
				createPackageJson: false,
				packageManager: null,
			}
		}
	}

	const detectedPm = detectPackageManagerFromLockfiles(opts.cwd)
	const packageManagerRaw = await p.select({
		message: "Which package manager would you like to use?",
		options: [
			{
				value: "npm",
				label: "npm",
				hint: detectedPm === "npm" ? "detected" : undefined,
			},
			{
				value: "yarn",
				label: "yarn",
				hint: detectedPm === "yarn" ? "detected" : undefined,
			},
			{
				value: "pnpm",
				label: "pnpm",
				hint: detectedPm === "pnpm" ? "detected" : undefined,
			},
			{
				value: "bun",
				label: "bun",
				hint: detectedPm === "bun" ? "detected" : undefined,
			},
		],
		initialValue: detectedPm ?? "npm",
	})

	if (p.isCancel(packageManagerRaw)) {
		p.cancel("Setup cancelled.")
		return null
	}

	const packageManager: PackageManager = parsePackageManager(packageManagerRaw)

	p.outro("Config selection complete.")
	return {
		preset,
		language,
		dependencies,
		installNow,
		createPackageJson,
		packageManager,
	}
}
