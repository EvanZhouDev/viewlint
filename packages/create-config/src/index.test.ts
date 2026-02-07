import { describe, expect, it } from "bun:test"

import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { runInternal } from "./index.js"

describe("runInternal", () => {
	it("exits before prompting if a config file already exists", async () => {
		const cwd = await fs.mkdtemp(
			path.join(os.tmpdir(), "viewlint-create-config-"),
		)
		try {
			await fs.writeFile(
				path.join(cwd, "viewlint.config.ts"),
				"// existing\n",
				"utf8",
			)

			let promptCalled = 0
			const exitCode = await runInternal({
				cwd,
				prompt: async () => {
					promptCalled += 1
					return null
				},
			})

			expect(exitCode).toBe(1)
			expect(promptCalled).toBe(0)
		} finally {
			await fs.rm(cwd, { recursive: true, force: true })
		}
	})
})
