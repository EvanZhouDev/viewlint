import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { findNearestViewlintConfigFile } from "../src/configFile.js"

describe("findNearestViewlintConfigFile", () => {
	let tempDir: string

	beforeEach(() => {
		// Use realpathSync to resolve symlinks (e.g., /var -> /private/var on macOS)
		tempDir = fs.realpathSync(
			fs.mkdtempSync(path.join(os.tmpdir(), "viewlint-test-")),
		)
	})

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true })
	})

	function createDir(...parts: string[]): string {
		const dir = path.join(tempDir, ...parts)
		fs.mkdirSync(dir, { recursive: true })
		return dir
	}

	function createFile(dir: string, filename: string): string {
		const filePath = path.join(dir, filename)
		fs.writeFileSync(filePath, "// test config")
		return filePath
	}

	describe("basic discovery", () => {
		it("finds config file in current directory", () => {
			const configPath = createFile(tempDir, "viewlint.config.ts")

			const result = findNearestViewlintConfigFile(tempDir)

			expect(result).toBe(configPath)
		})

		it("returns full absolute path to the found file", () => {
			createFile(tempDir, "viewlint.config.ts")

			const result = findNearestViewlintConfigFile(tempDir)

			expect(result).toBeDefined()
			expect(typeof result).toBe("string")
			if (typeof result === "string") {
				expect(path.isAbsolute(result)).toBe(true)
			}
		})
	})

	describe("priority order", () => {
		it("returns .ts when both .ts and .js exist", () => {
			const tsPath = createFile(tempDir, "viewlint.config.ts")
			createFile(tempDir, "viewlint.config.js")

			const result = findNearestViewlintConfigFile(tempDir)

			expect(result).toBe(tsPath)
		})

		it("returns .js when both .js and .mjs exist", () => {
			const jsPath = createFile(tempDir, "viewlint.config.js")
			createFile(tempDir, "viewlint.config.mjs")

			const result = findNearestViewlintConfigFile(tempDir)

			expect(result).toBe(jsPath)
		})

		it("returns .ts when all three exist", () => {
			const tsPath = createFile(tempDir, "viewlint.config.ts")
			createFile(tempDir, "viewlint.config.js")
			createFile(tempDir, "viewlint.config.mjs")

			const result = findNearestViewlintConfigFile(tempDir)

			expect(result).toBe(tsPath)
		})

		it("returns .mjs when only .mjs exists", () => {
			const mjsPath = createFile(tempDir, "viewlint.config.mjs")

			const result = findNearestViewlintConfigFile(tempDir)

			expect(result).toBe(mjsPath)
		})

		it("returns .js when only .js exists", () => {
			const jsPath = createFile(tempDir, "viewlint.config.js")

			const result = findNearestViewlintConfigFile(tempDir)

			expect(result).toBe(jsPath)
		})
	})

	describe("directory traversal", () => {
		it("finds config file in parent directory", () => {
			const childDir = createDir("child")
			const configPath = createFile(tempDir, "viewlint.config.ts")

			const result = findNearestViewlintConfigFile(childDir)

			expect(result).toBe(configPath)
		})

		it("finds config file in grandparent directory", () => {
			const grandchildDir = createDir("child", "grandchild")
			const configPath = createFile(tempDir, "viewlint.config.ts")

			const result = findNearestViewlintConfigFile(grandchildDir)

			expect(result).toBe(configPath)
		})

		it("finds config file in nearest ancestor (closer wins over farther)", () => {
			const childDir = createDir("child")
			const grandchildDir = createDir("child", "grandchild")
			createFile(tempDir, "viewlint.config.ts")
			const childConfigPath = createFile(childDir, "viewlint.config.ts")

			const result = findNearestViewlintConfigFile(grandchildDir)

			expect(result).toBe(childConfigPath)
		})
	})

	describe("not found", () => {
		it("returns undefined when no config file exists in the tree", () => {
			const deepDir = createDir("a", "b", "c", "d")

			const result = findNearestViewlintConfigFile(deepDir)

			expect(result).toBeUndefined()
		})

		it("returns undefined for empty directory tree", () => {
			const emptyDir = createDir("empty")

			const result = findNearestViewlintConfigFile(emptyDir)

			expect(result).toBeUndefined()
		})
	})

	describe("nested scenarios", () => {
		it("returns config file in start directory even if parent also has one", () => {
			const childDir = createDir("child")
			createFile(tempDir, "viewlint.config.ts")
			const childConfigPath = createFile(childDir, "viewlint.config.js")

			const result = findNearestViewlintConfigFile(childDir)

			expect(result).toBe(childConfigPath)
		})

		it("works correctly with deep nesting", () => {
			const deepDir = createDir("a", "b", "c", "d", "e", "f")
			const configPath = createFile(tempDir, "viewlint.config.mjs")

			const result = findNearestViewlintConfigFile(deepDir)

			expect(result).toBe(configPath)
		})

		it("finds nearest config in middle of tree", () => {
			createDir("level1")
			const level2 = createDir("level1", "level2")
			createDir("level1", "level2", "level3")
			const level4 = createDir("level1", "level2", "level3", "level4")

			createFile(tempDir, "viewlint.config.ts")
			const level2ConfigPath = createFile(level2, "viewlint.config.js")

			const result = findNearestViewlintConfigFile(level4)

			expect(result).toBe(level2ConfigPath)
		})
	})

	describe("default startDirPath behavior", () => {
		it("uses process.cwd() when startDirPath is not provided", () => {
			const originalCwd = process.cwd()

			try {
				process.chdir(tempDir)
				const configPath = createFile(tempDir, "viewlint.config.ts")

				const result = findNearestViewlintConfigFile()

				expect(result).toBe(configPath)
			} finally {
				process.chdir(originalCwd)
			}
		})

		it("uses process.cwd() when startDirPath is undefined", () => {
			const originalCwd = process.cwd()

			try {
				process.chdir(tempDir)
				const configPath = createFile(tempDir, "viewlint.config.js")

				const result = findNearestViewlintConfigFile(undefined)

				expect(result).toBe(configPath)
			} finally {
				process.chdir(originalCwd)
			}
		})
	})

	describe("edge cases", () => {
		it("handles directory with only non-config files", () => {
			createFile(tempDir, "package.json")
			createFile(tempDir, "tsconfig.json")
			createFile(tempDir, "viewlint.config.yaml")

			const result = findNearestViewlintConfigFile(tempDir)

			expect(result).toBeUndefined()
		})

		it("handles similar but incorrect config filenames", () => {
			createFile(tempDir, "viewlint.config.tsx")
			createFile(tempDir, "viewlint.config.cjs")
			createFile(tempDir, "viewlint-config.ts")
			createFile(tempDir, "viewlint_config.ts")

			const result = findNearestViewlintConfigFile(tempDir)

			expect(result).toBeUndefined()
		})

		it("prioritizes correctly when parent has higher priority file than child", () => {
			const childDir = createDir("child")
			createFile(tempDir, "viewlint.config.ts")
			const childMjsPath = createFile(childDir, "viewlint.config.mjs")

			const result = findNearestViewlintConfigFile(childDir)

			expect(result).toBe(childMjsPath)
		})
	})
})
