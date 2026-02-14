import { chromium } from "playwright"
import { type View, ViewLint } from "viewlint"
import { describe, expect, test } from "vitest"

import rulesPlugin from "../src/index.js"

const createHtmlView = (html: string): View => {
	return {
		setup: async () => {
			const browser = await chromium.launch()
			const context = await browser.newContext({
				viewport: { width: 800, height: 600 },
			})
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

const lintHtml = async (
	html: string,
	rules: Record<string, "error" | "warn" | "info">,
) => {
	const viewlint = new ViewLint({
		baseConfig: [
			{
				plugins: { rules: rulesPlugin },
				rules,
			},
		],
	})

	const view = createHtmlView(html)
	const results = await viewlint.lintTargets([{ view }])
	return results[0]
}

describe("@viewlint/rules unexpected-scrollbar", () => {
	test(
		"detects small horizontal scrollbar with overflow:auto (1-20px)",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    width: 200px;
    overflow-x: auto;
    border: 1px solid #000;
  }
  #content {
    width: 210px;
    height: 50px;
    background: #eee;
  }
</style>

<div id="container">
  <div id="content"></div>
</div>
`,
				{
					"rules/unexpected-scrollbar": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			expect(
				messages.some((m) => m.ruleId === "rules/unexpected-scrollbar"),
			).toBe(true)
			expect(messages.some((m) => m.message.includes("horizontal"))).toBe(true)
		},
	)

	test(
		"detects small vertical scrollbar with overflow:auto (1-20px)",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    width: 200px;
    height: 100px;
    overflow-y: auto;
    border: 1px solid #000;
  }
  #content {
    width: 100%;
    height: 115px;
    background: #eee;
  }
</style>

<div id="container">
  <div id="content"></div>
</div>
`,
				{
					"rules/unexpected-scrollbar": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			expect(
				messages.some((m) => m.ruleId === "rules/unexpected-scrollbar"),
			).toBe(true)
			expect(messages.some((m) => m.message.includes("vertical"))).toBe(true)
		},
	)

	test(
		"detects small scrollbar with overflow:scroll",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    width: 200px;
    height: 100px;
    overflow: scroll;
    border: 1px solid #000;
  }
  #content {
    width: 205px;
    height: 105px;
    background: #eee;
  }
</style>

<div id="container">
  <div id="content"></div>
</div>
`,
				{
					"rules/unexpected-scrollbar": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			expect(
				messages.some((m) => m.ruleId === "rules/unexpected-scrollbar"),
			).toBe(true)
		},
	)

	test(
		"detects both horizontal and vertical scrollbars",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    width: 200px;
    height: 100px;
    overflow: auto;
    border: 1px solid #000;
  }
  #content {
    width: 212px;
    height: 108px;
    background: #eee;
  }
</style>

<div id="container">
  <div id="content"></div>
</div>
`,
				{
					"rules/unexpected-scrollbar": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			expect(
				messages.some((m) => m.ruleId === "rules/unexpected-scrollbar"),
			).toBe(true)
			expect(
				messages.some(
					(m) =>
						m.message.includes("horizontally") &&
						m.message.includes("vertically"),
				),
			).toBe(true)
		},
	)

	test(
		"does NOT trigger for large scroll amounts (>20px) - likely intentional",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    width: 200px;
    height: 100px;
    overflow: auto;
    border: 1px solid #000;
  }
  #content {
    width: 400px;
    height: 300px;
    background: #eee;
  }
</style>

<div id="container">
  <div id="content"></div>
</div>
`,
				{
					"rules/unexpected-scrollbar": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"does NOT trigger when there is no scroll (scrollWidth == clientWidth)",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    width: 200px;
    height: 100px;
    overflow: auto;
    border: 1px solid #000;
  }
  #content {
    width: 100%;
    height: 50px;
    background: #eee;
  }
</style>

<div id="container">
  <div id="content"></div>
</div>
`,
				{
					"rules/unexpected-scrollbar": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"does NOT trigger for overflow:hidden (no scrollbar possible)",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    width: 200px;
    height: 100px;
    overflow: hidden;
    border: 1px solid #000;
  }
  #content {
    width: 210px;
    height: 110px;
    background: #eee;
  }
</style>

<div id="container">
  <div id="content"></div>
</div>
`,
				{
					"rules/unexpected-scrollbar": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"does NOT trigger for invisible elements",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    width: 200px;
    height: 100px;
    overflow: auto;
    border: 1px solid #000;
    display: none;
  }
  #content {
    width: 210px;
    height: 110px;
    background: #eee;
  }
</style>

<div id="container">
  <div id="content"></div>
</div>
`,
				{
					"rules/unexpected-scrollbar": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"does NOT trigger for elements with visibility:hidden",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    width: 200px;
    height: 100px;
    overflow: auto;
    border: 1px solid #000;
    visibility: hidden;
  }
  #content {
    width: 210px;
    height: 110px;
    background: #eee;
  }
</style>

<div id="container">
  <div id="content"></div>
</div>
`,
				{
					"rules/unexpected-scrollbar": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"detects unexpected scrollbar on document.documentElement (html element)",
		{ timeout: 60_000 },
		async () => {
			// When the documentElement (html) itself is the scroll container and has
			// a small overflow amount, it should be detected.
			// Note: Browser scrolling quirks mean we need to be explicit about dimensions.
			const result = await lintHtml(
				`
<style>
  html {
    height: 600px;
    overflow-y: scroll;
  }
  body {
    margin: 0;
    padding: 0;
    height: 615px;
  }
</style>

<div>Content</div>
`,
				{
					"rules/unexpected-scrollbar": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			expect(
				messages.some((m) => m.ruleId === "rules/unexpected-scrollbar"),
			).toBe(true)
		},
	)

	test(
		"detects unexpected scrollbar on document.body",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  html {
    height: 100%;
  }
  body {
    margin: 0;
    height: 100%;
    overflow-y: auto;
  }
  #content {
    height: calc(100% + 15px);
    background: #eee;
  }
</style>

<div id="content">Content</div>
`,
				{
					"rules/unexpected-scrollbar": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			expect(
				messages.some((m) => m.ruleId === "rules/unexpected-scrollbar"),
			).toBe(true)
		},
	)

	test(
		"does NOT trigger for zero-sized elements",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    width: 0;
    height: 0;
    overflow: auto;
  }
  #content {
    width: 10px;
    height: 10px;
    background: #eee;
  }
</style>

<div id="container">
  <div id="content"></div>
</div>
`,
				{
					"rules/unexpected-scrollbar": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"detects 1px overflow (minimum threshold)",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    width: 200px;
    overflow-x: auto;
    border: 1px solid #000;
  }
  #content {
    width: 201px;
    height: 50px;
    background: #eee;
  }
</style>

<div id="container">
  <div id="content"></div>
</div>
`,
				{
					"rules/unexpected-scrollbar": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			expect(
				messages.some((m) => m.ruleId === "rules/unexpected-scrollbar"),
			).toBe(true)
		},
	)

	test(
		"detects 20px overflow (maximum threshold)",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    width: 200px;
    overflow-x: auto;
    border: 1px solid #000;
  }
  #content {
    width: 220px;
    height: 50px;
    background: #eee;
  }
</style>

<div id="container">
  <div id="content"></div>
</div>
`,
				{
					"rules/unexpected-scrollbar": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			expect(
				messages.some((m) => m.ruleId === "rules/unexpected-scrollbar"),
			).toBe(true)
		},
	)

	test(
		"does NOT trigger for 21px overflow (just above threshold)",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    width: 200px;
    overflow-x: auto;
    border: 1px solid #000;
  }
  #content {
    width: 221px;
    height: 50px;
    background: #eee;
  }
</style>

<div id="container">
  <div id="content"></div>
</div>
`,
				{
					"rules/unexpected-scrollbar": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"does NOT trigger for overflow:visible (default, no scrollbar)",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    width: 200px;
    height: 100px;
    overflow: visible;
    border: 1px solid #000;
  }
  #content {
    width: 210px;
    height: 110px;
    background: #eee;
  }
</style>

<div id="container">
  <div id="content"></div>
</div>
`,
				{
					"rules/unexpected-scrollbar": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"handles mixed overflow-x and overflow-y values",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    width: 200px;
    height: 100px;
    overflow-x: hidden;
    overflow-y: auto;
    border: 1px solid #000;
  }
  #content {
    width: 210px;
    height: 110px;
    background: #eee;
  }
</style>

<div id="container">
  <div id="content"></div>
</div>
`,
				{
					"rules/unexpected-scrollbar": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			expect(
				messages.some((m) => m.ruleId === "rules/unexpected-scrollbar"),
			).toBe(true)
			expect(messages.some((m) => m.message.includes("vertical"))).toBe(true)
			expect(messages.some((m) => m.message.includes("horizontal"))).toBe(false)
		},
	)
})
