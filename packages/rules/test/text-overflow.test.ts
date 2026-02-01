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

describe("@viewlint/rules text-overflow", () => {
	test(
		"detects basic text overflow - text extends beyond container horizontally",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    width: 100px;
    white-space: nowrap;
    font: 16px monospace;
    border: 1px solid #000;
  }
</style>

<div id="container">This is a very long text that will definitely overflow</div>
`,
				{
					"rules/text-overflow": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			expect(messages.some((m) => m.ruleId === "rules/text-overflow")).toBe(
				true,
			)
		},
	)

	test(
		"does NOT trigger when text-overflow: ellipsis is set",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    width: 100px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font: 16px monospace;
    border: 1px solid #000;
  }
</style>

<div id="container">This is a very long text that will definitely overflow</div>
`,
				{
					"rules/text-overflow": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"reports horizontal overflow on the right side",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    width: 80px;
    white-space: nowrap;
    font: 16px monospace;
    border: 1px solid #000;
  }
</style>

<div id="container">Very long text overflowing right</div>
`,
				{
					"rules/text-overflow": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			const textOverflowMessage = messages.find(
				(m) => m.ruleId === "rules/text-overflow",
			)
			expect(textOverflowMessage).toBeDefined()
			expect(textOverflowMessage?.message).toMatch(/right/)
		},
	)

	test(
		"reports horizontal overflow on the left side",
		{ timeout: 60_000 },
		async () => {
			// The rule checks direct text nodes of an element, so we use text-indent to push text left
			const result = await lintHtml(
				`
<style>
  #container {
    width: 100px;
    height: 30px;
    font: 16px monospace;
    border: 1px solid #000;
    text-indent: -50px;
    white-space: nowrap;
  }
</style>

<div id="container">Left overflow text here</div>
`,
				{
					"rules/text-overflow": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			const textOverflowMessage = messages.find(
				(m) => m.ruleId === "rules/text-overflow",
			)
			expect(textOverflowMessage).toBeDefined()
			expect(textOverflowMessage?.message).toMatch(/left/)
		},
	)

	test(
		"reports vertical overflow on the bottom (most common vertical overflow case)",
		{ timeout: 60_000 },
		async () => {
			// Vertical overflow is most commonly on the bottom (text too tall for container)
			// Top overflow is rare in practice and hard to trigger with CSS on direct text
			const result = await lintHtml(
				`
<style>
  #container {
    width: 200px;
    height: 10px;
    font: 20px/20px monospace;
    border: 1px solid #000;
  }
</style>

<div id="container">Text overflows the container vertically</div>
`,
				{
					"rules/text-overflow": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			const textOverflowMessage = messages.find(
				(m) => m.ruleId === "rules/text-overflow",
			)
			expect(textOverflowMessage).toBeDefined()
			expect(textOverflowMessage?.message).toMatch(/bottom/)
		},
	)

	test(
		"reports vertical overflow on the bottom",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    width: 200px;
    height: 20px;
    font: 16px/1 monospace;
    border: 1px solid #000;
    overflow: visible;
  }
</style>

<div id="container">Line one<br>Line two<br>Line three</div>
`,
				{
					"rules/text-overflow": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			const textOverflowMessage = messages.find(
				(m) => m.ruleId === "rules/text-overflow",
			)
			expect(textOverflowMessage).toBeDefined()
			expect(textOverflowMessage?.message).toMatch(/bottom/)
		},
	)

	test(
		"vertical threshold is based on font-size (50% of font-size)",
		{ timeout: 60_000 },
		async () => {
			// With 20px font, vertical threshold is 10px (50%)
			// Container height of 18px with 20px font means only 2px overflow - below 10px threshold
			const resultNoTrigger = await lintHtml(
				`
<style>
  #container {
    width: 200px;
    height: 18px;
    font: 20px/20px monospace;
    border: 1px solid #000;
  }
</style>

<div id="container">Text</div>
`,
				{
					"rules/text-overflow": "error",
				},
			)

			expect(resultNoTrigger?.messages ?? []).toHaveLength(0)

			// With 20px font, vertical threshold is 10px (50%)
			// Container height of 5px with 20px font means 15px overflow - above 10px threshold
			const resultTrigger = await lintHtml(
				`
<style>
  #container {
    width: 200px;
    height: 5px;
    font: 20px/20px monospace;
    border: 1px solid #000;
  }
</style>

<div id="container">Text</div>
`,
				{
					"rules/text-overflow": "error",
				},
			)

			const messages = resultTrigger?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			expect(messages.some((m) => m.ruleId === "rules/text-overflow")).toBe(
				true,
			)
		},
	)

	test(
		"horizontal threshold is fixed at 1px - small overflow below threshold does not trigger",
		{ timeout: 60_000 },
		async () => {
			// Text that overflows by less than 1px should not trigger
			const result = await lintHtml(
				`
<style>
  #container {
    width: 100px;
    font: 16px monospace;
    border: 1px solid #000;
  }
</style>

<div id="container">Short</div>
`,
				{
					"rules/text-overflow": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"horizontal threshold is fixed at 1px - overflow above threshold triggers",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    width: 50px;
    white-space: nowrap;
    font: 16px monospace;
    border: 1px solid #000;
  }
</style>

<div id="container">This definitely overflows by more than 1px</div>
`,
				{
					"rules/text-overflow": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			expect(messages.some((m) => m.ruleId === "rules/text-overflow")).toBe(
				true,
			)
		},
	)

	test(
		"reports text preview in message (first 30 chars with ellipsis)",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    width: 50px;
    white-space: nowrap;
    font: 16px monospace;
    border: 1px solid #000;
  }
</style>

<div id="container">This is a very long text that exceeds thirty characters easily</div>
`,
				{
					"rules/text-overflow": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			const textOverflowMessage = messages.find(
				(m) => m.ruleId === "rules/text-overflow",
			)
			expect(textOverflowMessage).toBeDefined()
			// Should contain first 30 chars followed by " ..."
			expect(textOverflowMessage?.message).toMatch(
				/"This is a very long text that \.\.\."/,
			)
		},
	)

	test(
		"reports short text preview without ellipsis for text under 30 chars",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    width: 30px;
    white-space: nowrap;
    font: 16px monospace;
    border: 1px solid #000;
  }
</style>

<div id="container">Short text</div>
`,
				{
					"rules/text-overflow": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			const textOverflowMessage = messages.find(
				(m) => m.ruleId === "rules/text-overflow",
			)
			expect(textOverflowMessage).toBeDefined()
			// Should contain the full text without "..."
			expect(textOverflowMessage?.message).toMatch(/"Short text"/)
			expect(textOverflowMessage?.message).not.toMatch(/\.\.\./)
		},
	)

	test(
		"only checks direct text nodes - nested text in child elements not reported on parent",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #parent {
    width: 200px;
    height: 50px;
    border: 1px solid #000;
  }
  #child {
    width: 50px;
    white-space: nowrap;
    font: 16px monospace;
  }
</style>

<div id="parent">
  <div id="child">This very long text overflows the child but not the parent</div>
</div>
`,
				{
					"rules/text-overflow": "error",
				},
			)

			const messages = result?.messages ?? []
			// Should report on #child, not #parent
			const parentMessage = messages.find(
				(m) =>
					m.ruleId === "rules/text-overflow" && m.message.includes("parent"),
			)
			expect(parentMessage).toBeUndefined()
		},
	)

	test(
		"does NOT trigger for invisible elements (display: none)",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    display: none;
    width: 50px;
    white-space: nowrap;
    font: 16px monospace;
    border: 1px solid #000;
  }
</style>

<div id="container">This is a very long text that would overflow if visible</div>
`,
				{
					"rules/text-overflow": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"does NOT trigger for invisible elements (visibility: hidden)",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    visibility: hidden;
    width: 50px;
    white-space: nowrap;
    font: 16px monospace;
    border: 1px solid #000;
  }
</style>

<div id="container">This is a very long text that would overflow if visible</div>
`,
				{
					"rules/text-overflow": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"does NOT trigger for invisible elements (opacity: 0)",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    opacity: 0;
    width: 50px;
    white-space: nowrap;
    font: 16px monospace;
    border: 1px solid #000;
  }
</style>

<div id="container">This is a very long text that would overflow if visible</div>
`,
				{
					"rules/text-overflow": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"zero-width containers with text still trigger overflow detection",
		{ timeout: 60_000 },
		async () => {
			// When an element has width: 0 but text still renders (due to overflow visible),
			// the rule correctly detects text extending beyond the zero-width container
			const result = await lintHtml(
				`
<style>
  #container {
    width: 0;
    white-space: nowrap;
    font: 16px monospace;
    border: 1px solid #000;
  }
</style>

<div id="container">This is a very long text</div>
`,
				{
					"rules/text-overflow": "error",
				},
			)

			// The rule DOES detect this because the text extends beyond the container's 0-width bounds
			expect(result?.messages ?? []).toHaveLength(1)
		},
	)

	test(
		"zero-height containers with text still trigger overflow detection",
		{ timeout: 60_000 },
		async () => {
			// Similarly, when height is 0, text still renders and overflows
			const result = await lintHtml(
				`
<style>
  #container {
    width: 50px;
    height: 0;
    white-space: nowrap;
    font: 16px monospace;
    border: 1px solid #000;
  }
</style>

<div id="container">This is text</div>
`,
				{
					"rules/text-overflow": "error",
				},
			)

			// The rule DOES detect this because the text extends beyond the container's 0-height bounds
			expect(result?.messages ?? []).toHaveLength(1)
		},
	)

	test(
		"does NOT trigger for visually hidden elements (clip-path pattern)",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
  }
</style>

<span class="visually-hidden">This is a very long screen reader only text that overflows</span>
`,
				{
					"rules/text-overflow": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"text that fits within container does not trigger",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    width: 300px;
    font: 16px monospace;
    border: 1px solid #000;
  }
</style>

<div id="container">Short text</div>
`,
				{
					"rules/text-overflow": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"overflow on right side is correctly reported",
		{ timeout: 60_000 },
		async () => {
			// Simpler test case for right overflow - use a container too narrow for the text
			const result = await lintHtml(
				`
<style>
  #container {
    width: 80px;
    white-space: nowrap;
    font: 16px monospace;
    border: 1px solid #000;
  }
</style>

<div id="container">Very long text overflowing right side of container</div>
`,
				{
					"rules/text-overflow": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			const textOverflowMessage = messages.find(
				(m) => m.ruleId === "rules/text-overflow",
			)
			expect(textOverflowMessage).toBeDefined()
			expect(textOverflowMessage?.message).toMatch(/right/)
		},
	)
})
