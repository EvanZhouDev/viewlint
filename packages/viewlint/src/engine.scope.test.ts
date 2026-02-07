import type { Page } from "playwright"
import { chromium } from "playwright"
import { describe, expect, test } from "vitest"
import { z } from "zod"
import { defineRule } from "../plugin/index.js"
import { ViewLint } from "./index.js"
import type { Plugin, SetupOpts, View } from "./types.js"

const createHtmlView = (html: string): View => {
	return {
		setup: async (opts?: SetupOpts) => {
			const browser = await chromium.launch()
			const context = await browser.newContext(opts?.context)
			const page = await context.newPage()

			const reset = async () => {
				await page.setContent(html)
			}

			await reset()

			return {
				page,
				reset,
				close: async () => {
					await context.close()
					await browser.close()
				},
			}
		},
	}
}

describe("ViewLint Target scopes", () => {
	test(
		"scope.queryAll is constrained to roots",
		{ timeout: 60_000 },
		async () => {
			const view = createHtmlView(
				'<div id="a"><span>a</span></div><div id="b"><span>b</span></div>',
			)

			const expectSpanCountRule = defineRule({
				meta: {
					schema: z.object({ expected: z.number().int().min(0) }),
					defaultOptions: [{ expected: 0 }],
				},
				async run(context) {
					const expected = context.options[0]?.expected
					if (typeof expected !== "number") {
						throw new Error("expected option must be provided")
					}

					const count = await context.evaluate(({ scope }) => {
						return scope.queryAll("span").length
					})

					if (count === expected) return
					context.report({
						message: `Expected ${expected} <span> elements in scope, got ${count}.`,
						location: {
							element: {
								selector: "body",
								tagName: "body",
								id: "",
								classes: [],
							},
						},
					})
				},
			})

			const plugin: Plugin = {
				rules: {
					"expect-span-count": expectSpanCountRule,
				},
			}

			const viewlint = new ViewLint({
				baseConfig: [
					{
						plugins: { test: plugin },
						rules: {
							"test/expect-span-count": ["error", { expected: 1 }],
						},
					},
				],
			})

			const scopeA = {
				getLocator: ({ page }: { page: Page }) => page.locator("#a"),
			}

			const scopedResults = await viewlint.lintTargets([
				{ view, scope: scopeA },
			])
			expect(scopedResults[0]?.messages).toHaveLength(0)

			const unscopedResults = await viewlint.lintTargets([{ view }])
			expect(unscopedResults[0]?.messages).toHaveLength(1)
		},
	)

	test(
		"scope is re-resolved after side-effect rule resets",
		{ timeout: 60_000 },
		async () => {
			const baselineHtml =
				'<div id="a"><span>a</span></div><div id="b"><span>b</span></div>'
			const view = createHtmlView(baselineHtml)

			const mutateRule = defineRule({
				meta: { hasSideEffects: true },
				async run(context) {
					await context.page.setContent(
						'<div id="a"><span>mutated</span></div>',
					)
				},
			})

			const countRule = defineRule({
				meta: {},
				async run(context) {
					const count = await context.evaluate(({ scope }) => {
						return scope.queryAll("span").length
					})
					if (count !== 1) {
						context.report({
							message: `Expected 1 <span> after reset, got ${count}.`,
							location: {
								element: {
									selector: "body",
									tagName: "body",
									id: "",
									classes: [],
								},
							},
						})
					}
				},
			})

			const plugin: Plugin = {
				rules: {
					"a-mutate": mutateRule,
					"b-count": countRule,
				},
			}

			const viewlint = new ViewLint({
				baseConfig: [
					{
						plugins: { test: plugin },
						rules: {
							"test/a-mutate": "error",
							"test/b-count": "error",
						},
					},
				],
			})

			const scopeA = {
				getLocator: ({ page }: { page: Page }) => page.locator("#a"),
			}

			const results = await viewlint.lintTargets([{ view, scope: scopeA }])
			expect(results[0]?.messages).toHaveLength(0)
		},
	)
})
