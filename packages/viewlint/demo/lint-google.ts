// Demo: lint `https://www.google.com` with a custom rule.
// Run: `bun packages/viewlint/demo/lint-google.ts`

import type { JSHandle, Locator } from "playwright"
import { z } from "zod"

import { defineRule } from "../plugin/index.js"
import type { Plugin, RuleDefinition } from "../src/types.js"

const titleContainsSchema = [
	z.string().trim().min(1, "Expected title substring must be non-empty"),
]

const titleContainsRule: RuleDefinition = defineRule({
	meta: {
		severity: "info",
		schema: titleContainsSchema,
	},
	async run(context) {
		const expectedSubstring = context.options[0]

		if (!expectedSubstring) {
			throw new Error("demoPlugin/title-contains expects a non-empty substring")
		}

		const actualTitle = await context.page.title()
		if (actualTitle.includes(expectedSubstring)) return

		const el: Locator = context.page.locator("title")

		const bodyHandle: JSHandle<HTMLElement> =
			await context.page.evaluateHandle("document.body")

		const _myRes1 = await context.page.evaluate("console.log", "hgi")

		const _myRes2 = await context.evaluate("console.log")

		const _testResult = await context.evaluate(
			({ report, arg: { handle, val } }) => {
				report({
					message: val,
					element: handle,
				})
				return 1
			},
			{ handle: bodyHandle, val: "hello world" },
		)

		await bodyHandle.dispose()

		context.report({
			message: `Page title does not contain expected substring "${expectedSubstring}". Actual title: "${actualTitle}"`,
			element: el,
		})
	},
})

export const demoPlugin: Plugin = {
	meta: {
		name: "viewlint-demo",
		namespace: "demoPlugin",
	},
	rules: {
		"title-contains": titleContainsRule,
	},
}
