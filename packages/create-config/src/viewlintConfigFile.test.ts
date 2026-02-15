import { describe, expect, it } from "vitest"

import { renderViewlintConfigFile } from "./viewlintConfigFile.js"

describe("renderViewlintConfigFile", () => {
	it("renders a TypeScript recommended config", () => {
		const rendered = renderViewlintConfigFile({
			preset: "recommended",
			language: "typescript",
		})

		expect(rendered.fileName).toBe("viewlint.config.ts")
		expect(rendered.contents).toBe(
			[
				'import { defineConfig } from "viewlint/config"',
				'import rules from "@viewlint/rules"',
				"",
				"export default defineConfig({",
				"\tplugins: {",
				"\t\trules,",
				"\t},",
				'\textends: ["rules/recommended"],',
				"})",
				"",
			].join("\n"),
		)
	})

	it("renders a JavaScript all-rules config (mjs)", () => {
		const rendered = renderViewlintConfigFile({
			preset: "all",
			language: "javascript",
		})

		expect(rendered.fileName).toBe("viewlint.config.mjs")
		expect(rendered.contents).toBe(
			[
				'import { defineConfig } from "viewlint/config"',
				'import rules from "@viewlint/rules"',
				"",
				"export default defineConfig({",
				"\tplugins: {",
				"\t\trules,",
				"\t},",
				'\textends: ["rules/all"],',
				"})",
				"",
			].join("\n"),
		)
	})
})
