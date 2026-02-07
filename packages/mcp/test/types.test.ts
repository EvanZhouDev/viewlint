import { describe, expect, it } from "vitest"
import { z } from "zod"
import { getConfigInputSchema, lintUrlsInputSchema } from "../src/types.js"

const lintUrlsInput = z.object(lintUrlsInputSchema)
const getConfigInput = z.object(getConfigInputSchema)

describe("mcp tool input schemas", () => {
	it("accepts minimal lint input", () => {
		const parsed = lintUrlsInput.parse({
			urls: ["https://example.com"],
		})
		expect(parsed).toEqual({
			urls: ["https://example.com"],
		})
	})

	it("accepts advanced lint input fields", () => {
		const parsed = lintUrlsInput.parse({
			urls: ["https://example.com", "https://example.org"],
			configFile: "./viewlint.config.ts",
			view: "loggedIn",
			options: ["mobile"],
			scopes: ["checkout"],
			selectors: ["#checkout"],
			quiet: true,
		})

		expect(parsed.view).toBe("loggedIn")
		expect(parsed.quiet).toBe(true)
		expect(parsed.options).toEqual(["mobile"])
	})

	it("rejects invalid urls", () => {
		expect(() =>
			lintUrlsInput.parse({
				urls: ["not-a-url"],
			}),
		).toThrow()
	})

	it("accepts empty get-config input and optional config path", () => {
		expect(getConfigInput.parse({})).toEqual({})
		expect(
			getConfigInput.parse({
				configFile: "viewlint.config.ts",
			}),
		).toEqual({
			configFile: "viewlint.config.ts",
		})
	})
})
