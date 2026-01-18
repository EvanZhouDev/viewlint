import fs from "node:fs"
import path from "node:path"

export type ViewLintConfigFileName =
	| "viewlint.config.ts"
	| "viewlint.config.js"
	| "viewlint.config.mjs"

const CONFIG_FILE_NAMES: ViewLintConfigFileName[] = [
	"viewlint.config.ts",
	"viewlint.config.js",
	"viewlint.config.mjs",
]

function findConfigInDir(dirPath: string): string | undefined {
	for (const fileName of CONFIG_FILE_NAMES) {
		const filePath = path.join(dirPath, fileName)
		if (fs.existsSync(filePath)) return filePath
	}

	return undefined
}

export function findNearestViewlintConfigFile(
	startDirPath: string = process.cwd(),
): string | undefined {
	let currentDir = path.resolve(startDirPath)

	while (true) {
		const found = findConfigInDir(currentDir)
		if (found) return found

		const parentDir = path.dirname(currentDir)
		if (parentDir === currentDir) return undefined

		currentDir = parentDir
	}
}
