import { describe, expect, it, vi } from "vitest"
import { runBin } from "../src/binEntry.js"

type BinDeps = Parameters<typeof runBin>[1]

function createDeps(overrides: Partial<BinDeps> = {}): {
	deps: BinDeps
	runCli: ReturnType<typeof vi.fn>
	spawnSync: ReturnType<typeof vi.fn>
	enableDebug: ReturnType<typeof vi.fn>
	writeStderr: ReturnType<typeof vi.fn>
} {
	const spawnSync = vi.fn(() => ({ status: 0 }))
	const runCli = vi.fn(async () => 0)
	const enableDebug = vi.fn()
	const writeStderr = vi.fn()

	const deps: BinDeps = {
		spawnSync,
		runCli,
		enableDebug,
		writeStdout: () => {},
		writeStderr,
		...overrides,
	}

	return { deps, runCli, spawnSync, enableDebug, writeStderr }
}

describe("runBin", () => {
	it("delegates to CLI by default", async () => {
		const { deps, runCli, spawnSync } = createDeps()

		const exitCode = await runBin(
			["node", "viewlint", "https://example.com"],
			deps,
		)

		expect(exitCode).toBe(0)
		expect(runCli).toHaveBeenCalledWith([
			"node",
			"viewlint",
			"https://example.com",
		])
		expect(spawnSync).not.toHaveBeenCalled()
	})

	it("enables debug when --verbose is passed", async () => {
		const { deps, enableDebug } = createDeps()

		const exitCode = await runBin(["node", "viewlint", "--verbose"], deps)

		expect(exitCode).toBe(0)
		expect(enableDebug).toHaveBeenCalledWith("viewlint*")
	})

	it("runs remote create-config package when --init is passed", async () => {
		const { deps, runCli, spawnSync, writeStderr } = createDeps()

		const exitCode = await runBin(["node", "viewlint", "--init"], deps)

		expect(exitCode).toBe(0)
		expect(writeStderr).toHaveBeenCalledWith(
			"You can also run this command directly using 'npx @viewlint/create-config@latest'.\n",
		)
		expect(spawnSync).toHaveBeenCalledTimes(1)
		expect(spawnSync).toHaveBeenCalledWith(
			"npx",
			["@viewlint/create-config@latest"],
			{
				encoding: "utf8",
				stdio: "inherit",
			},
		)
		expect(runCli).not.toHaveBeenCalled()
	})

	it("runs remote MCP package when --mcp is passed", async () => {
		const { deps, runCli, spawnSync, writeStderr } = createDeps()

		const exitCode = await runBin(["node", "viewlint", "--mcp"], deps)

		expect(exitCode).toBe(0)
		expect(writeStderr).toHaveBeenCalledWith(
			"You can also run this command directly using 'npx @viewlint/mcp@latest'.\n",
		)
		expect(spawnSync).toHaveBeenCalledTimes(1)
		expect(spawnSync).toHaveBeenCalledWith("npx", ["@viewlint/mcp@latest"], {
			encoding: "utf8",
			stdio: "inherit",
		})
		expect(runCli).not.toHaveBeenCalled()
	})
})
