import { pathToFileURL } from "node:url"

import { isRecord } from "./helpers.js"
import type { Config, ConfigObject } from "./types.js"

function isConfigObject(value: unknown): value is ConfigObject {
	if (!isRecord(value)) return false

	const keys = Object.keys(value)
	if (keys.length === 0) return false

	const allowedKeys = new Set([
		"plugins",
		"rules",
		"options",
		"views",
		"scopes",
	])
	return keys.every((key) => allowedKeys.has(key))
}

export async function loadViewlintConfigFromFile(
	filePath: string,
): Promise<Config | Config[]> {
	const imported: unknown = await import(pathToFileURL(filePath).href)
	if (!isRecord(imported)) {
		throw new Error(
			`Invalid viewlint config file '${filePath}'. Expected the module to export an object.`,
		)
	}
	const mod = imported

	const exportedDefault = mod.default
	const namedConfig = mod.config

	if (
		typeof exportedDefault === "undefined" &&
		typeof namedConfig === "undefined"
	) {
		console.warn(
			`ViewLint config file '${filePath}' did not export anything. It is being treated as an empty configuration file. If this is intentional, export default [] instead of leaving the file without exports.`,
		)
		return []
	}

	const candidate = exportedDefault ?? namedConfig

	if (Array.isArray(candidate)) {
		for (const item of candidate) {
			if (!isConfigObject(item)) {
				throw new Error(
					`Invalid viewlint config file '${filePath}'. Expected default export to be ConfigObject[] (array of { plugins?, rules?, options?, views?, scopes? }).`,
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
