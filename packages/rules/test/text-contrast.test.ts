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

describe("@viewlint/rules text-contrast", () => {
	test(
		"detects low contrast - light gray text on white background",
		{ timeout: 90_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  body {
    margin: 0;
    padding: 20px;
    background: #ffffff;
  }
  #low-contrast {
    color: #cccccc;
    font-size: 16px;
  }
</style>

<p id="low-contrast">This text has very low contrast</p>
`,
				{
					"rules/text-contrast": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			expect(messages.some((m) => m.ruleId === "rules/text-contrast")).toBe(
				true,
			)
		},
	)

	test(
		"does NOT trigger for high contrast - black text on white background",
		{ timeout: 90_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  body {
    margin: 0;
    padding: 20px;
    background: #ffffff;
  }
  #high-contrast {
    color: #000000;
    font-size: 16px;
  }
</style>

<p id="high-contrast">This text has excellent contrast</p>
`,
				{
					"rules/text-contrast": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"reports contrast ratio in the message",
		{ timeout: 90_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  body {
    margin: 0;
    padding: 20px;
    background: #ffffff;
  }
  #low-contrast {
    color: #dddddd;
    font-size: 16px;
  }
</style>

<p id="low-contrast">Low contrast text</p>
`,
				{
					"rules/text-contrast": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			const contrastMessage = messages.find(
				(m) => m.ruleId === "rules/text-contrast",
			)
			expect(contrastMessage).toBeDefined()
			// Should contain contrast ratio pattern like "1.23:1"
			expect(contrastMessage?.message).toMatch(/\d+\.\d+:1/)
		},
	)

	test(
		"minimum contrast ratio is 2.0:1 - values just below trigger, just above pass",
		{ timeout: 90_000 },
		async () => {
			// Color with contrast ratio just below 2.0:1 should trigger
			// #b0b0b0 on white has contrast of ~1.96:1
			const resultBelow = await lintHtml(
				`
<style>
  body {
    margin: 0;
    padding: 20px;
    background: #ffffff;
  }
  #just-below {
    color: #b8b8b8;
    font-size: 16px;
  }
</style>

<p id="just-below">Just below threshold</p>
`,
				{
					"rules/text-contrast": "error",
				},
			)

			const messagesBelow = resultBelow?.messages ?? []
			expect(messagesBelow.length).toBeGreaterThan(0)
			expect(
				messagesBelow.some((m) => m.ruleId === "rules/text-contrast"),
			).toBe(true)

			// Color with contrast ratio above 2.0:1 should pass
			// #777777 on white has contrast of ~4.48:1
			const resultAbove = await lintHtml(
				`
<style>
  body {
    margin: 0;
    padding: 20px;
    background: #ffffff;
  }
  #above-threshold {
    color: #777777;
    font-size: 16px;
  }
</style>

<p id="above-threshold">Above threshold</p>
`,
				{
					"rules/text-contrast": "error",
				},
			)

			expect(resultAbove?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"reports text color and background color in message",
		{ timeout: 90_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  body {
    margin: 0;
    padding: 20px;
    background: #ffffff;
  }
  #low-contrast {
    color: #dddddd;
    font-size: 16px;
  }
</style>

<p id="low-contrast">Low contrast text</p>
`,
				{
					"rules/text-contrast": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			const contrastMessage = messages.find(
				(m) => m.ruleId === "rules/text-contrast",
			)
			expect(contrastMessage).toBeDefined()
			// Should contain "Text color:" and "background:"
			expect(contrastMessage?.message).toContain("Text color:")
			expect(contrastMessage?.message).toContain("background:")
			// Should contain rgb format
			expect(contrastMessage?.message).toMatch(/rgb\(\d+, \d+, \d+\)/)
		},
	)

	test(
		"uses screenshot-based background sampling for actual rendered colors",
		{ timeout: 90_000 },
		async () => {
			// Test that the rule detects low contrast even when background
			// comes from an ancestor element (inherited background)
			const result = await lintHtml(
				`
<style>
  body {
    margin: 0;
    padding: 0;
  }
  #container {
    padding: 20px;
    background: #ffffff;
  }
  #text {
    color: #cccccc;
    font-size: 16px;
    /* No background set - inherits visually from container */
  }
</style>

<div id="container">
  <span id="text">Inherited background contrast issue</span>
</div>
`,
				{
					"rules/text-contrast": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			expect(messages.some((m) => m.ruleId === "rules/text-contrast")).toBe(
				true,
			)
		},
	)

	test(
		"does NOT trigger for invisible elements (display: none)",
		{ timeout: 90_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  body {
    margin: 0;
    padding: 20px;
    background: #ffffff;
  }
  #hidden {
    display: none;
    color: #ffffff;
    font-size: 16px;
  }
</style>

<p id="hidden">This hidden text has zero contrast but should not trigger</p>
<p style="color: black;">Visible high contrast text</p>
`,
				{
					"rules/text-contrast": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"does NOT trigger for invisible elements (visibility: hidden)",
		{ timeout: 90_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  body {
    margin: 0;
    padding: 20px;
    background: #ffffff;
  }
  #invisible {
    visibility: hidden;
    color: #ffffff;
    font-size: 16px;
  }
</style>

<p id="invisible">This invisible text has zero contrast but should not trigger</p>
<p style="color: black;">Visible high contrast text</p>
`,
				{
					"rules/text-contrast": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"does NOT trigger for elements outside viewport",
		{ timeout: 90_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  body {
    margin: 0;
    padding: 20px;
    background: #ffffff;
  }
  #offscreen-left {
    position: absolute;
    left: -9999px;
    color: #ffffff;
    font-size: 16px;
  }
  #offscreen-top {
    position: absolute;
    top: -9999px;
    color: #ffffff;
    font-size: 16px;
  }
  #offscreen-bottom {
    position: absolute;
    top: 9999px;
    color: #ffffff;
    font-size: 16px;
  }
</style>

<p id="offscreen-left">Offscreen left - low contrast but not in viewport</p>
<p id="offscreen-top">Offscreen top - low contrast but not in viewport</p>
<p id="offscreen-bottom">Offscreen bottom - low contrast but not in viewport</p>
<p style="color: black;">Visible high contrast text</p>
`,
				{
					"rules/text-contrast": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"only checks elements with direct text nodes - not containers",
		{ timeout: 90_000 },
		async () => {
			// The container div has no direct text, only nested elements with text
			// Only the span with direct text should be checked
			const result = await lintHtml(
				`
<style>
  body {
    margin: 0;
    padding: 20px;
    background: #ffffff;
  }
  #container {
    color: #cccccc;
    font-size: 16px;
  }
  #good-text {
    color: #000000;
  }
</style>

<div id="container">
  <span id="good-text">High contrast nested text</span>
</div>
`,
				{
					"rules/text-contrast": "error",
				},
			)

			// The container has low contrast color but no direct text
			// The span has good contrast
			// Should not trigger
			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test("works with solid background color", { timeout: 90_000 }, async () => {
		const result = await lintHtml(
			`
<style>
  body {
    margin: 0;
    padding: 20px;
    background: #333333;
  }
  #low-contrast-dark {
    color: #555555;
    font-size: 16px;
  }
</style>

<p id="low-contrast-dark">Dark gray on dark background</p>
`,
			{
				"rules/text-contrast": "error",
			},
		)

		const messages = result?.messages ?? []
		expect(messages.length).toBeGreaterThan(0)
		expect(messages.some((m) => m.ruleId === "rules/text-contrast")).toBe(true)
	})

	test(
		"works with inherited background from nested containers",
		{ timeout: 90_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  body {
    margin: 0;
    padding: 0;
  }
  #outer {
    background: #1a1a1a;
    padding: 20px;
  }
  #inner {
    padding: 10px;
    /* No background - inherits dark from outer */
  }
  #text {
    color: #333333;
    font-size: 16px;
  }
</style>

<div id="outer">
  <div id="inner">
    <p id="text">Dark text on inherited dark background</p>
  </div>
</div>
`,
				{
					"rules/text-contrast": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			expect(messages.some((m) => m.ruleId === "rules/text-contrast")).toBe(
				true,
			)
		},
	)

	test(
		"high contrast dark text on light background passes",
		{ timeout: 90_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  body {
    margin: 0;
    padding: 20px;
    background: #f5f5f5;
  }
  #good-dark {
    color: #222222;
    font-size: 16px;
  }
</style>

<p id="good-dark">Dark text on light background - good contrast</p>
`,
				{
					"rules/text-contrast": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"high contrast light text on dark background passes",
		{ timeout: 90_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  body {
    margin: 0;
    padding: 20px;
    background: #1a1a1a;
  }
  #good-light {
    color: #ffffff;
    font-size: 16px;
  }
</style>

<p id="good-light">White text on dark background - good contrast</p>
`,
				{
					"rules/text-contrast": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"detects low contrast with colored backgrounds",
		{ timeout: 90_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  body {
    margin: 0;
    padding: 20px;
    background: #3366cc;
  }
  #low-contrast-blue {
    color: #4477dd;
    font-size: 16px;
  }
</style>

<p id="low-contrast-blue">Similar blue text on blue background</p>
`,
				{
					"rules/text-contrast": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			expect(messages.some((m) => m.ruleId === "rules/text-contrast")).toBe(
				true,
			)
		},
	)

	test(
		"does NOT trigger for zero-size elements",
		{ timeout: 90_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  body {
    margin: 0;
    padding: 20px;
    background: #ffffff;
  }
  #zero-size {
    width: 0;
    height: 0;
    overflow: hidden;
    color: #ffffff;
    font-size: 16px;
  }
</style>

<p id="zero-size">Zero contrast but zero size</p>
<p style="color: black;">Visible high contrast text</p>
`,
				{
					"rules/text-contrast": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"message includes minimum required ratio (2.0:1)",
		{ timeout: 90_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  body {
    margin: 0;
    padding: 20px;
    background: #ffffff;
  }
  #low-contrast {
    color: #dddddd;
    font-size: 16px;
  }
</style>

<p id="low-contrast">Low contrast text</p>
`,
				{
					"rules/text-contrast": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			const contrastMessage = messages.find(
				(m) => m.ruleId === "rules/text-contrast",
			)
			expect(contrastMessage).toBeDefined()
			expect(contrastMessage?.message).toContain("minimum 2")
		},
	)

	test(
		"multiple low contrast elements each generate their own message",
		{ timeout: 90_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  body {
    margin: 0;
    padding: 20px;
    background: #ffffff;
  }
  .low-contrast {
    color: #dddddd;
    font-size: 16px;
    margin: 10px 0;
  }
</style>

<p id="first" class="low-contrast">First low contrast text</p>
<p id="second" class="low-contrast">Second low contrast text</p>
<p id="third" class="low-contrast">Third low contrast text</p>
`,
				{
					"rules/text-contrast": "error",
				},
			)

			const messages = result?.messages ?? []
			const contrastMessages = messages.filter(
				(m) => m.ruleId === "rules/text-contrast",
			)
			expect(contrastMessages.length).toBe(3)
		},
	)
})
