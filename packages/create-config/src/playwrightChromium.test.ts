import { describe, expect, it } from "vitest"

import {
	formatPlaywrightChromiumInstallCommand,
	getPlaywrightChromiumInstallCommand,
	installPlaywrightChromium,
	isPlaywrightChromiumInstalled,
} from "./playwrightChromium.js"

describe("getPlaywrightChromiumInstallCommand", () => {
	it("builds an npm playwright chromium install command", () => {
		expect(
			getPlaywrightChromiumInstallCommand({ packageManager: "npm" }),
		).toEqual({
			command: "npm",
			args: ["exec", "playwright", "install", "chromium"],
		})
	})

	it("falls back to npx when no package manager is selected", () => {
		expect(
			getPlaywrightChromiumInstallCommand({ packageManager: null }),
		).toEqual({
			command: "npx",
			args: ["playwright", "install", "chromium"],
		})
	})
})

describe("formatPlaywrightChromiumInstallCommand", () => {
	it("formats a readable command string", () => {
		expect(
			formatPlaywrightChromiumInstallCommand({ packageManager: "pnpm" }),
		).toBe("pnpm exec playwright install chromium")
	})
})

describe("isPlaywrightChromiumInstalled", () => {
	it("returns false when playwright is not resolvable", async () => {
		const installed = await isPlaywrightChromiumInstalled({
			cwd: "/tmp",
			runtime: {
				resolvePlaywright: () => {
					throw new Error("MODULE_NOT_FOUND")
				},
			},
		})

		expect(installed).toBe(false)
	})

	it("returns false when chromium executable cannot be accessed", async () => {
		const installed = await isPlaywrightChromiumInstalled({
			cwd: "/tmp",
			runtime: {
				resolvePlaywright: () => "/tmp/playwright/index.js",
				importModule: async () => ({
					chromium: { executablePath: () => "/tmp/chrome" },
				}),
				access: async () => {
					throw new Error("ENOENT")
				},
			},
		})

		expect(installed).toBe(false)
	})

	it("returns true when chromium executable exists and is executable", async () => {
		const installed = await isPlaywrightChromiumInstalled({
			cwd: "/tmp",
			runtime: {
				resolvePlaywright: () => "/tmp/playwright/index.js",
				importModule: async () => ({
					chromium: { executablePath: () => "/tmp/chrome" },
				}),
				access: async () => {},
			},
		})

		expect(installed).toBe(true)
	})
})

describe("installPlaywrightChromium", () => {
	it("spawns playwright install command", async () => {
		const calls: Array<{ command: string; args: string[] }> = []

		const exitCode = await installPlaywrightChromium({
			cwd: "/tmp",
			packageManager: "yarn",
			runtime: {
				platform: "darwin",
				spawnSync: (command, args, _options) => {
					calls.push({ command, args })
					return { status: 0 }
				},
			},
		})

		expect(exitCode).toBe(0)
		expect(calls).toEqual([
			{
				command: "yarn",
				args: ["playwright", "install", "chromium"],
			},
		])
	})
})
