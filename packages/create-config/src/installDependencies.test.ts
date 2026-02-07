import { describe, expect, it } from "bun:test"

import { getInstallCommand } from "./installDependencies.js"

describe("getInstallCommand", () => {
	const deps = ["viewlint", "@viewlint/rules"]

	it("builds an npm dev install command", () => {
		expect(
			getInstallCommand({ packageManager: "npm", dependencies: deps }),
		).toEqual({ command: "npm", args: ["install", "--save-dev", ...deps] })
	})

	it("builds a yarn dev add command", () => {
		expect(
			getInstallCommand({ packageManager: "yarn", dependencies: deps }),
		).toEqual({ command: "yarn", args: ["add", "--dev", ...deps] })
	})

	it("builds a pnpm dev add command", () => {
		expect(
			getInstallCommand({ packageManager: "pnpm", dependencies: deps }),
		).toEqual({ command: "pnpm", args: ["add", "--save-dev", ...deps] })
	})

	it("builds a bun dev add command", () => {
		expect(
			getInstallCommand({ packageManager: "bun", dependencies: deps }),
		).toEqual({ command: "bun", args: ["add", "--dev", ...deps] })
	})
})
