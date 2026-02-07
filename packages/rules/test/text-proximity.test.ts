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

describe("@viewlint/rules text-proximity", () => {
	test(
		"detects two text elements too close horizontally",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    display: flex;
    font: 16px sans-serif;
  }
  #left, #right {
    display: inline-block;
  }
  #right {
    margin-left: 1px;
  }
</style>

<div id="container">
  <span id="left">Hello</span>
  <span id="right">World</span>
</div>
`,
				{
					"rules/text-proximity": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			expect(messages.some((m) => m.ruleId === "rules/text-proximity")).toBe(
				true,
			)
		},
	)

	test(
		"does not trigger for elements with enough gap (>35% of font-size or >3px minimum)",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    display: flex;
    font: 16px sans-serif;
  }
  #left, #right {
    display: inline-block;
  }
  #right {
    margin-left: 10px;
  }
</style>

<div id="container">
  <span id="left">Hello</span>
  <span id="right">World</span>
</div>
`,
				{
					"rules/text-proximity": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"only checks horizontally adjacent elements (not vertically stacked)",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    display: flex;
    flex-direction: column;
    font: 16px sans-serif;
  }
  #top, #bottom {
    display: block;
  }
  #bottom {
    margin-top: 1px;
  }
</style>

<div id="container">
  <span id="top">Hello</span>
  <span id="bottom">World</span>
</div>
`,
				{
					"rules/text-proximity": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"requires 50% vertical overlap to trigger",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    position: relative;
    font: 16px sans-serif;
  }
  #left {
    position: absolute;
    top: 0;
    left: 0;
    height: 20px;
    line-height: 20px;
  }
  #right {
    position: absolute;
    top: 15px;
    left: 50px;
    height: 20px;
    line-height: 20px;
  }
</style>

<div id="container">
  <span id="left">Hello</span>
  <span id="right">World</span>
</div>
`,
				{
					"rules/text-proximity": "error",
				},
			)

			// Only 5px overlap out of 20px height = 25% overlap, should not trigger
			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"triggers with good vertical overlap and small horizontal gap",
		{ timeout: 60_000 },
		async () => {
			// For the rule to trigger, elements must:
			// 1. Have same parent
			// 2. Have >50% vertical overlap
			// 3. Have horizontal gap < max(3px, 35% of font-size)
			// With 16px font, min gap = max(3, 5.6) = 5.6px
			const result = await lintHtml(
				`
<style>
  #container {
    display: flex;
    align-items: flex-start;
    font: 16px sans-serif;
  }
  #left {
    display: inline-block;
  }
  #right {
    display: inline-block;
    margin-left: 2px;
    margin-top: 5px; /* Slight vertical offset, but still >50% overlap */
  }
</style>

<div id="container">
  <span id="left">Hello</span>
  <span id="right">World</span>
</div>
`,
				{
					"rules/text-proximity": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			expect(messages.some((m) => m.ruleId === "rules/text-proximity")).toBe(
				true,
			)
		},
	)

	test(
		"only reports siblings with same parent",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    display: flex;
    font: 16px sans-serif;
  }
  #left-wrapper, #right-wrapper {
    display: inline-block;
  }
  #left, #right {
    display: inline-block;
  }
  #right-wrapper {
    margin-left: 1px;
  }
</style>

<div id="container">
  <div id="left-wrapper">
    <span id="left">Hello</span>
  </div>
  <div id="right-wrapper">
    <span id="right">World</span>
  </div>
</div>
`,
				{
					"rules/text-proximity": "error",
				},
			)

			// The spans have different parents (left-wrapper vs right-wrapper)
			// So this should not trigger for them
			// But the wrappers ARE siblings, so if they have text, they might trigger
			// Since spans are the only text elements, and they have different parents, no report
			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"reports gap in pixels and minimum required in message",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    display: flex;
    font: 16px sans-serif;
  }
  #left, #right {
    display: inline-block;
  }
  #right {
    margin-left: 2px;
  }
</style>

<div id="container">
  <span id="left">Hello</span>
  <span id="right">World</span>
</div>
`,
				{
					"rules/text-proximity": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			const proximityMessage = messages.find(
				(m) => m.ruleId === "rules/text-proximity",
			)
			expect(proximityMessage).toBeDefined()
			// Message format: "Text too close (Xpx gap, min Ypx): ..."
			expect(proximityMessage?.message).toMatch(/\d+px gap/)
			expect(proximityMessage?.message).toMatch(/min \d+px/)
		},
	)

	test("reports text preview in message", { timeout: 60_000 }, async () => {
		const result = await lintHtml(
			`
<style>
  #container {
    display: flex;
    font: 16px sans-serif;
  }
  #left, #right {
    display: inline-block;
  }
  #right {
    margin-left: 1px;
  }
</style>

<div id="container">
  <span id="left">FirstText</span>
  <span id="right">SecondText</span>
</div>
`,
			{
				"rules/text-proximity": "error",
			},
		)

		const messages = result?.messages ?? []
		expect(messages.length).toBeGreaterThan(0)
		const proximityMessage = messages.find(
			(m) => m.ruleId === "rules/text-proximity",
		)
		expect(proximityMessage).toBeDefined()
		expect(proximityMessage?.message).toContain("FirstText")
		expect(proximityMessage?.message).toContain("SecondText")
	})

	test(
		"includes Adjacent text element relation in report",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    display: flex;
    font: 16px sans-serif;
  }
  #left, #right {
    display: inline-block;
  }
  #right {
    margin-left: 1px;
  }
</style>

<div id="container">
  <span id="left">Hello</span>
  <span id="right">World</span>
</div>
`,
				{
					"rules/text-proximity": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			const proximityMessage = messages.find(
				(m) => m.ruleId === "rules/text-proximity",
			)
			expect(proximityMessage).toBeDefined()
			expect(proximityMessage?.relations).toBeDefined()
			expect(proximityMessage?.relations?.length).toBeGreaterThan(0)
			expect(
				proximityMessage?.relations?.some(
					(r) => r.description === "Adjacent text element",
				),
			).toBe(true)
		},
	)

	test(
		"does not trigger for nested elements",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #outer {
    font: 16px sans-serif;
  }
  #inner {
    display: inline;
  }
</style>

<div id="outer">
  Hello <span id="inner">World</span>
</div>
`,
				{
					"rules/text-proximity": "error",
				},
			)

			// Nested elements (one contains the other) should be skipped
			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"requires minimum text length of 2 characters",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    display: flex;
    font: 16px sans-serif;
  }
  #left, #right {
    display: inline-block;
  }
  #right {
    margin-left: 1px;
  }
</style>

<div id="container">
  <span id="left">A</span>
  <span id="right">B</span>
</div>
`,
				{
					"rules/text-proximity": "error",
				},
			)

			// Single character text should not trigger (MIN_TEXT_LENGTH = 2)
			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"triggers for text with exactly 2 characters",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    display: flex;
    font: 16px sans-serif;
  }
  #left, #right {
    display: inline-block;
  }
  #right {
    margin-left: 1px;
  }
</style>

<div id="container">
  <span id="left">Hi</span>
  <span id="right">Ok</span>
</div>
`,
				{
					"rules/text-proximity": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			expect(messages.some((m) => m.ruleId === "rules/text-proximity")).toBe(
				true,
			)
		},
	)

	test(
		"uses 3px minimum gap for small font sizes",
		{ timeout: 60_000 },
		async () => {
			// For 8px font, 35% would be 2.8px, but MIN_GAP_PX is 3px
			// So a gap of 2.9px should still trigger
			const result = await lintHtml(
				`
<style>
  #container {
    display: flex;
    font: 8px sans-serif;
  }
  #left, #right {
    display: inline-block;
  }
  #right {
    margin-left: 2px;
  }
</style>

<div id="container">
  <span id="left">Hello</span>
  <span id="right">World</span>
</div>
`,
				{
					"rules/text-proximity": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			expect(messages.some((m) => m.ruleId === "rules/text-proximity")).toBe(
				true,
			)
		},
	)

	test(
		"does not trigger when gap exceeds 3px minimum for small fonts",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    display: flex;
    font: 8px sans-serif;
  }
  #left, #right {
    display: inline-block;
  }
  #right {
    margin-left: 5px;
  }
</style>

<div id="container">
  <span id="left">Hello</span>
  <span id="right">World</span>
</div>
`,
				{
					"rules/text-proximity": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"truncates long text previews in message",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    display: flex;
    font: 16px sans-serif;
  }
  #left, #right {
    display: inline-block;
  }
  #right {
    margin-left: 1px;
  }
</style>

<div id="container">
  <span id="left">ThisIsAVeryLongTextThatShouldBeTruncated</span>
  <span id="right">AnotherLongTextThatShouldAlsoBeTruncated</span>
</div>
`,
				{
					"rules/text-proximity": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			const proximityMessage = messages.find(
				(m) => m.ruleId === "rules/text-proximity",
			)
			expect(proximityMessage).toBeDefined()
			// Text should be truncated to 15 chars + "..."
			expect(proximityMessage?.message).toContain("...")
			expect(proximityMessage?.message).toContain("ThisIsAVeryLong...")
		},
	)

	test("does not report the same pair twice", { timeout: 60_000 }, async () => {
		const result = await lintHtml(
			`
<style>
  #container {
    display: flex;
    font: 16px sans-serif;
  }
  span {
    display: inline-block;
    margin-right: 1px;
  }
</style>

<div id="container">
  <span>Text1</span>
  <span>Text2</span>
</div>
`,
			{
				"rules/text-proximity": "error",
			},
		)

		const messages = result?.messages ?? []
		const proximityMessages = messages.filter(
			(m) => m.ruleId === "rules/text-proximity",
		)
		// Should only report once, not twice (once for each direction)
		expect(proximityMessages.length).toBe(1)
	})

	test(
		"detects multiple proximity issues in same container",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    display: flex;
    font: 16px sans-serif;
  }
  span {
    display: inline-block;
    margin-right: 1px;
  }
</style>

<div id="container">
  <span>First</span>
  <span>Second</span>
  <span>Third</span>
</div>
`,
				{
					"rules/text-proximity": "error",
				},
			)

			const messages = result?.messages ?? []
			const proximityMessages = messages.filter(
				(m) => m.ruleId === "rules/text-proximity",
			)
			// Should report First-Second and Second-Third pairs
			expect(proximityMessages.length).toBe(2)
		},
	)

	test(
		"does not trigger for hidden elements",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    display: flex;
    font: 16px sans-serif;
  }
  #left, #right {
    display: inline-block;
  }
  #left {
    visibility: hidden;
  }
  #right {
    margin-left: 1px;
  }
</style>

<div id="container">
  <span id="left">Hello</span>
  <span id="right">World</span>
</div>
`,
				{
					"rules/text-proximity": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"does not trigger for display:none elements",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    display: flex;
    font: 16px sans-serif;
  }
  #left, #right {
    display: inline-block;
  }
  #left {
    display: none;
  }
  #right {
    margin-left: 1px;
  }
</style>

<div id="container">
  <span id="left">Hello</span>
  <span id="right">World</span>
</div>
`,
				{
					"rules/text-proximity": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)
})
