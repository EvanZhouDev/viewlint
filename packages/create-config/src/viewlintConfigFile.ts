import fs from "node:fs/promises"
import path from "node:path"

import type { ConfigLanguage, ConfigPreset } from "./promptForSetupPlan.js"

type ViewLintConfigFileName =
	| "viewlint.config.ts"
	| "viewlint.config.js"
	| "viewlint.config.mjs"

const VIEWLINT_CONFIG_FILE_NAMES: readonly ViewLintConfigFileName[] = [
	"viewlint.config.ts",
	"viewlint.config.js",
	"viewlint.config.mjs",
]

function getTargetConfigFileName(
	language: ConfigLanguage,
): ViewLintConfigFileName {
	if (language === "typescript") return "viewlint.config.ts"
	if (language === "javascript") return "viewlint.config.mjs"

	const _exhaustive: never = language
	throw new Error(`Unsupported config language: ${_exhaustive}`)
}

function getExtendsString(preset: ConfigPreset): string {
	if (preset === "recommended") return "rules/recommended"
	if (preset === "all") return "rules/all"

	const _exhaustive: never = preset
	throw new Error(`Unsupported preset: ${_exhaustive}`)
}

export function renderViewlintConfigFile(opts: {
	preset: ConfigPreset
	language: ConfigLanguage
}): { fileName: ViewLintConfigFileName; contents: string } {
	const fileName = getTargetConfigFileName(opts.language)
	const extendsString = getExtendsString(opts.preset)

	const contents =
		`import { defineConfig } from "viewlint/config"\n` +
		`import rules from "@viewlint/rules"\n` +
		`\n` +
		`export default defineConfig({\n` +
		`\tplugins: {\n` +
		`\t\trules,\n` +
		`\t},\n` +
		`\textends: ["${extendsString}"],\n` +
		`})\n`

	return { fileName, contents }
}

export async function findExistingViewlintConfigFile(opts: {
	cwd: string
	runtime?: {
		stat?: (filePath: string) => Promise<unknown>
	}
}): Promise<string | null> {
	const stat = opts.runtime?.stat ?? fs.stat

	for (const fileName of VIEWLINT_CONFIG_FILE_NAMES) {
		const filePath = path.join(opts.cwd, fileName)
		try {
			await stat(filePath)
			return filePath
		} catch {
			// Not found.
		}
	}

	return null
}

export async function writeViewlintConfigFile(opts: {
	cwd: string
	preset: ConfigPreset
	language: ConfigLanguage
	runtime?: {
		writeFile?: (
			filePath: string,
			contents: string,
			encoding: "utf8",
		) => Promise<void>
	}
}): Promise<string> {
	const writeFile = opts.runtime?.writeFile ?? fs.writeFile

	const rendered = renderViewlintConfigFile({
		preset: opts.preset,
		language: opts.language,
	})

	const targetPath = path.join(opts.cwd, rendered.fileName)
	await writeFile(targetPath, rendered.contents, "utf8")
	return targetPath
}
