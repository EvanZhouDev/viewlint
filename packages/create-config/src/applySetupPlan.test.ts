import { describe, expect, it } from "bun:test"

import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { applySetupPlan } from "./applySetupPlan.js"
import type { SetupPlan } from "./promptForSetupPlan.js"
import { renderViewlintConfigFile } from "./viewlintConfigFile.js"

async function makeTempProjectDir(): Promise<string> {
	const dir = await fs.mkdtemp(
		path.join(os.tmpdir(), "viewlint-create-config-"),
	)
	await fs.writeFile(
		path.join(dir, "package.json"),
		JSON.stringify({ name: "tmp", private: true }, null, 2),
		"utf8",
	)
	return dir
}

async function makeTempDirWithoutPackageJson(): Promise<string> {
	return fs.mkdtemp(path.join(os.tmpdir(), "viewlint-create-config-"))
}

describe("applySetupPlan", () => {
	it("writes the config file and skips install when installNow=false", async () => {
		const cwd = await makeTempProjectDir()
		try {
			const plan: SetupPlan = {
				preset: "recommended",
				language: "typescript",
				dependencies: ["viewlint", "@viewlint/rules"],
				installNow: false,
				createPackageJson: false,
				packageManager: null,
			}

			const result = await applySetupPlan({ cwd, plan })
			expect(result.exitCode).toBe(0)
			expect(result.installed).toBe(false)
			expect(result.existingConfigFilePath).toBe(null)
			expect(result.configFilePath).not.toBe(null)

			const rendered = renderViewlintConfigFile({
				preset: plan.preset,
				language: plan.language,
			})

			const configPath = path.join(cwd, rendered.fileName)
			const raw = await fs.readFile(configPath, "utf8")
			expect(raw).toBe(rendered.contents)
		} finally {
			await fs.rm(cwd, { recursive: true, force: true })
		}
	})

	it("spawns the expected install command when installNow=true", async () => {
		const cwd = await makeTempProjectDir()
		try {
			const calls: Array<{ command: string; args: string[] }> = []

			const result = await applySetupPlan({
				cwd,
				plan: {
					preset: "all",
					language: "javascript",
					dependencies: ["viewlint", "@viewlint/rules"],
					installNow: true,
					createPackageJson: false,
					packageManager: "npm",
				},
				runtime: {
					platform: "darwin",
					spawnSync: (command, args, _options) => {
						calls.push({ command, args })
						return { status: 0 }
					},
				},
			})

			expect(result.exitCode).toBe(0)
			expect(result.installed).toBe(true)
			expect(calls).toEqual([
				{
					command: "npm",
					args: ["install", "--save-dev", "viewlint", "@viewlint/rules"],
				},
			])
		} finally {
			await fs.rm(cwd, { recursive: true, force: true })
		}
	})

	it("creates package.json before installing when requested", async () => {
		const cwd = await makeTempDirWithoutPackageJson()
		try {
			const writes: Array<{ filePath: string; contents: string }> = []
			const calls: Array<{ command: string; args: string[] }> = []

			const result = await applySetupPlan({
				cwd,
				plan: {
					preset: "recommended",
					language: "typescript",
					dependencies: ["viewlint", "@viewlint/rules"],
					installNow: true,
					createPackageJson: true,
					packageManager: "npm",
				},
				runtime: {
					platform: "darwin",
					stat: async (filePath) => {
						const wrote = writes.some((w) => w.filePath === filePath)
						if (wrote) {
							return { isFile: () => true }
						}
						throw new Error(`ENOENT: ${filePath}`)
					},
					writeFile: async (filePath, contents, _encoding) => {
						writes.push({ filePath, contents })
					},
					spawnSync: (command, args, _options) => {
						calls.push({ command, args })
						return { status: 0 }
					},
				},
			})

			expect(result.exitCode).toBe(0)
			expect(result.createdPackageJsonPath).toBe(path.join(cwd, "package.json"))

			const wrotePackageJson = writes.some((w) =>
				w.filePath.endsWith("/package.json"),
			)
			expect(wrotePackageJson).toBe(true)
			expect(calls.length).toBe(1)
		} finally {
			await fs.rm(cwd, { recursive: true, force: true })
		}
	})
})
