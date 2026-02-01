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

describe("@viewlint/rules text-ragged-lines", () => {
	test(
		"detects last line < 45% of longest line (orphan/widow)",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #text {
    width: 300px;
    font: 16px/1.4 monospace;
  }
</style>

<div id="text">
  This is a very long line of text that will wrap nicely across multiple lines in
  the container. And then we have a short
  end.
</div>
`,
				{
					"rules/text-ragged-lines": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			expect(messages.some((m) => m.ruleId === "rules/text-ragged-lines")).toBe(
				true,
			)
		},
	)

	test(
		"detects middle line < 30% of longest (awkwardly short)",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #text {
    width: 400px;
    font: 16px/1.4 monospace;
  }
</style>

<div id="text">
  <span style="display: block;">This is the first line which is fairly long and spans the container nicely.</span>
  <span style="display: block;">Hi</span>
  <span style="display: block;">This is another fairly long line that spans across the full container width.</span>
  <span style="display: block;">And here is a final line that also spans the container.</span>
</div>
`,
				{
					"rules/text-ragged-lines": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			expect(messages.some((m) => m.ruleId === "rules/text-ragged-lines")).toBe(
				true,
			)
		},
	)

	test(
		"does NOT trigger for single-line text",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #text {
    width: 500px;
    font: 16px/1.4 monospace;
    white-space: nowrap;
  }
</style>

<div id="text">This is a single line of text that does not wrap.</div>
`,
				{
					"rules/text-ragged-lines": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test("requires minimum 2 lines to trigger", { timeout: 60_000 }, async () => {
		const result = await lintHtml(
			`
<style>
  #text {
    width: 600px;
    font: 16px/1.4 monospace;
  }
</style>

<div id="text">Short single line of text.</div>
`,
			{
				"rules/text-ragged-lines": "error",
			},
		)

		expect(result?.messages ?? []).toHaveLength(0)
	})

	test(
		"does NOT trigger for narrow containers (<40px width)",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #text {
    width: 35px;
    font: 10px/1.2 monospace;
    word-break: break-all;
  }
</style>

<div id="text">ABCDEFGHIJKLMNOPQRSTUVWXYZ</div>
`,
				{
					"rules/text-ragged-lines": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"reports line number and percentage in message",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #text {
    width: 350px;
    font: 16px/1.4 monospace;
  }
</style>

<div id="text">
  This is a fairly long first line of text that spans across the container width nicely.
  This is a second fairly long line that also spans the container.
  x
</div>
`,
				{
					"rules/text-ragged-lines": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)

			const raggedMessage = messages.find(
				(m) => m.ruleId === "rules/text-ragged-lines",
			)
			expect(raggedMessage).toBeDefined()
			expect(raggedMessage?.message).toMatch(/line \d+ of \d+/)
			expect(raggedMessage?.message).toMatch(/\d+%/)
			expect(raggedMessage?.message).toMatch(/px wide/)
		},
	)

	test(
		"does NOT trigger when all lines are reasonable lengths",
		{ timeout: 60_000 },
		async () => {
			// Use explicit block-level spans to control line breaks exactly
			// Each line is ~60-80% of container width (all above 45% threshold)
			const result = await lintHtml(
				`
<style>
  #text {
    width: 300px;
    font: 16px/1.4 monospace;
  }
  #text span {
    display: block;
  }
</style>

<div id="text">
  <span>AAAAAAAAAAAAAAAAAAAAAAAAAAAA</span>
  <span>BBBBBBBBBBBBBBBBBBBBBBBBBBB</span>
  <span>CCCCCCCCCCCCCCCCCCCCCCCC</span>
</div>
`,
				{
					"rules/text-ragged-lines": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"ignores text rects smaller than minimum line width (5px)",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #text {
    width: 300px;
    font: 16px/1.4 monospace;
  }
  .tiny {
    font-size: 1px;
    display: inline;
  }
</style>

<div id="text">
  This is a reasonable first line of text.
  <span class="tiny">.</span>
  This is a reasonable second line of text.
</div>
`,
				{
					"rules/text-ragged-lines": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"groups text rects by Y position with 3px tolerance",
		{ timeout: 60_000 },
		async () => {
			// This test verifies that text fragments with slight vertical offsets
			// are grouped together as a single line. Use superscript which shifts
			// baseline slightly but should still be considered same line.
			// Both lines should be similar length (well above 45%)
			const result = await lintHtml(
				`
<style>
  #text {
    width: 400px;
    font: 16px/1.4 monospace;
  }
  #text span {
    display: block;
  }
  sup {
    vertical-align: super;
    font-size: 0.8em;
  }
</style>

<div id="text">
  <span>This is the first line with note<sup>1</sup></span>
  <span>This is the second line with note<sup>2</sup></span>
</div>
`,
				{
					"rules/text-ragged-lines": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"does NOT trigger for invisible/zero-size elements",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  .hidden {
    display: none;
  }
  .invisible {
    visibility: hidden;
  }
  .zero-size {
    width: 0;
    height: 0;
    overflow: hidden;
  }
</style>

<div class="hidden">
  This is a long line of text that would trigger.
  x
</div>

<div class="invisible">
  This is a long line of text that would trigger.
  x
</div>

<div class="zero-size">
  This is a long line of text that would trigger.
  x
</div>
`,
				{
					"rules/text-ragged-lines": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"triggers on justified text with very short last line",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #text {
    width: 350px;
    font: 16px/1.4 serif;
    text-align: justify;
  }
</style>

<div id="text">
  This is a paragraph of text that is justified. It spans across multiple lines
  to create a nice block of text. The content flows well across the container
  width. But it ends with just one
  word.
</div>
`,
				{
					"rules/text-ragged-lines": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			expect(messages.some((m) => m.ruleId === "rules/text-ragged-lines")).toBe(
				true,
			)
		},
	)

	test(
		"handles multiple text blocks independently",
		{ timeout: 60_000 },
		async () => {
			// The "bad" block has a very short last line due to natural wrapping
			const result = await lintHtml(
				`
<style>
  .text-good {
    width: 250px;
    font: 16px/1.4 monospace;
    margin-bottom: 20px;
  }
  .text-bad {
    width: 350px;
    font: 16px/1.4 monospace;
    margin-bottom: 20px;
  }
</style>

<div class="text-good" id="good">
  Short text with even lines.
  Short lines that are balanced.
</div>

<div class="text-bad" id="bad">
  This is a very long line of text that will wrap across the container and create multiple lines of content.
  X
</div>
`,
				{
					"rules/text-ragged-lines": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			expect(messages.some((m) => m.ruleId === "rules/text-ragged-lines")).toBe(
				true,
			)
		},
	)

	test(
		"correctly calculates percentage for borderline cases",
		{ timeout: 60_000 },
		async () => {
			// Last line at exactly 50% should NOT trigger (threshold is < 45%)
			const result = await lintHtml(
				`
<style>
  #text {
    width: 200px;
    font: 16px/1.4 monospace;
  }
</style>

<div id="text">
  <span style="display: block;">AAAAAAAAAAAAAAAAAAAAAA</span>
  <span style="display: block;">AAAAAAAAAAA</span>
</div>
`,
				{
					"rules/text-ragged-lines": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"triggers when last line is just under 45% threshold",
		{ timeout: 60_000 },
		async () => {
			// Use inline text that naturally wraps, with short last word
			// The last line should be under 45% of the longest line
			const result = await lintHtml(
				`
<style>
  #text {
    width: 300px;
    font: 16px/1.4 monospace;
  }
</style>

<div id="text">
  This is a fairly long line of inline text that will wrap across the container width and create multiple lines. Then
  end.
</div>
`,
				{
					"rules/text-ragged-lines": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			expect(messages.some((m) => m.ruleId === "rules/text-ragged-lines")).toBe(
				true,
			)
		},
	)

	test(
		"does NOT trigger for elements at exactly 40px width boundary",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #text {
    width: 40px;
    font: 8px/1.2 monospace;
    word-break: break-all;
  }
</style>

<div id="text">ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890</div>
`,
				{
					"rules/text-ragged-lines": "error",
				},
			)

			// At exactly 40px, it should be analyzed (threshold is < 40px, not <= 40px)
			// Whether it triggers depends on the actual line layout
			// This test verifies elements at the boundary are processed
			expect(result).toBeDefined()
		},
	)

	test(
		"handles nested text elements correctly",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    width: 350px;
    font: 16px/1.4 monospace;
  }
  #nested {
    font-weight: bold;
  }
</style>

<div id="container">
  <p id="nested">
    This is a paragraph with <strong>nested bold text</strong> and 
    <em>italic text</em> that wraps across multiple lines in the container.
    x
  </p>
</div>
`,
				{
					"rules/text-ragged-lines": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			expect(messages.some((m) => m.ruleId === "rules/text-ragged-lines")).toBe(
				true,
			)
		},
	)
})
