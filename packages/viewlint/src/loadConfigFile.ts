import { pathToFileURL } from "node:url"

import { safeCast } from "./helpers.js"
import type { Config, ConfigObject } from "./types.js"

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null
}

function isConfigObject(value: unknown): value is ConfigObject {
	if (!isRecord(value)) return false

	const keys = Object.keys(value)
	return (
		keys.length > 0 && keys.every((key) => key === "plugins" || key === "rules")
	)
}

export async function loadViewlintConfigFromFile(
	filePath: string,
): Promise<Config | Config[]> {
	const mod: Record<string, unknown> = safeCast<Record<string, unknown>>(
		await import(pathToFileURL(filePath).href),
	)

	const exportedDefault = mod.default
	const namedConfig = mod.config

	const candidate = exportedDefault ?? namedConfig

	if (Array.isArray(candidate)) {
		for (const item of candidate) {
			if (!isConfigObject(item)) {
				throw new Error(
					`Invalid viewlint config file '${filePath}'. Expected default export to be ConfigObject[] (array of { plugins?, rules? }).`,
				)
			}
		}

		return candidate
	}

	if (isConfigObject(candidate)) {
		return candidate
	}

	throw new Error(
		`Invalid viewlint config file '${filePath}'. Expected default export to be ConfigObject or ConfigObject[].`,
	)
}
