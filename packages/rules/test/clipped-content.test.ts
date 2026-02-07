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

describe("clipped-content rule", () => {
	// ==========================================================================
	// 1. Basic clipping detection - overflow:hidden with scrollable content
	// ==========================================================================

	describe("basic clipping detection", () => {
		test(
			"detects horizontal content clipping with overflow:hidden",
			{ timeout: 60_000 },
			async () => {
				const result = await lintHtml(
					`
<style>
  #container {
    width: 100px;
    overflow: hidden;
    white-space: nowrap;
    font: 16px/1 monospace;
  }
</style>

<div id="container">THIS IS A VERY VERY VERY VERY VERY LONG LINE OF TEXT</div>
`,
					{ "rules/clipped-content": "error" },
				)

				const messages = result?.messages ?? []
				expect(messages.length).toBeGreaterThan(0)
				expect(messages.some((m) => m.ruleId === "rules/clipped-content")).toBe(
					true,
				)
				expect(messages.some((m) => m.message.includes("horizontally"))).toBe(
					true,
				)
			},
		)

		test(
			"detects vertical content clipping with overflow:hidden",
			{ timeout: 60_000 },
			async () => {
				const result = await lintHtml(
					`
<style>
  #container {
    width: 200px;
    height: 40px;
    overflow: hidden;
    font: 16px/1.5 sans-serif;
  }
</style>

<div id="container">
  <p>Line 1</p>
  <p>Line 2</p>
  <p>Line 3</p>
  <p>Line 4</p>
  <p>Line 5</p>
</div>
`,
					{ "rules/clipped-content": "error" },
				)

				const messages = result?.messages ?? []
				expect(messages.length).toBeGreaterThan(0)
				expect(messages.some((m) => m.ruleId === "rules/clipped-content")).toBe(
					true,
				)
				expect(messages.some((m) => m.message.includes("vertically"))).toBe(
					true,
				)
			},
		)

		test(
			"detects both horizontal and vertical clipping",
			{ timeout: 60_000 },
			async () => {
				const result = await lintHtml(
					`
<style>
  #container {
    width: 100px;
    height: 50px;
    overflow: hidden;
    font: 16px/1 monospace;
  }
  #inner {
    width: 300px;
    height: 200px;
    background: #eee;
  }
</style>

<div id="container">
  <div id="inner">Large content block</div>
</div>
`,
					{ "rules/clipped-content": "error" },
				)

				const messages = result?.messages ?? []
				expect(messages.length).toBeGreaterThan(0)
				expect(messages.some((m) => m.ruleId === "rules/clipped-content")).toBe(
					true,
				)
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
			"detects clipping with overflow:clip value",
			{ timeout: 60_000 },
			async () => {
				const result = await lintHtml(
					`
<style>
  #container {
    width: 100px;
    overflow: clip;
    white-space: nowrap;
    font: 16px/1 monospace;
  }
</style>

<div id="container">THIS IS A VERY VERY VERY VERY VERY LONG LINE OF TEXT</div>
`,
					{ "rules/clipped-content": "error" },
				)

				const messages = result?.messages ?? []
				expect(messages.length).toBeGreaterThan(0)
				expect(messages.some((m) => m.ruleId === "rules/clipped-content")).toBe(
					true,
				)
			},
		)
	})

	// ==========================================================================
	// 2. NOT triggered when text-overflow:ellipsis is set
	// ==========================================================================

	describe("text-overflow:ellipsis exemption", () => {
		test(
			"does not report when text-overflow:ellipsis is applied",
			{ timeout: 60_000 },
			async () => {
				const result = await lintHtml(
					`
<style>
  #ellipsis {
    width: 100px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font: 16px/1 monospace;
  }
</style>

<div id="ellipsis">THIS IS A VERY VERY VERY VERY VERY LONG LINE OF TEXT</div>
`,
					{ "rules/clipped-content": "error" },
				)

				expect(result?.messages ?? []).toHaveLength(0)
			},
		)

		test(
			"does not report ellipsis with inline-block child",
			{ timeout: 60_000 },
			async () => {
				const result = await lintHtml(
					`
<style>
  #ellipsis {
    width: 120px;
    border: 1px solid #000;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font: 16px/1 monospace;
  }
  #ellipsis > span {
    display: inline-block;
  }
</style>

<div id="ellipsis">
  <span>THIS IS A VERY VERY VERY VERY VERY VERY LONG LINE OF TEXT</span>
</div>
`,
					{ "rules/clipped-content": "error" },
				)

				expect(result?.messages ?? []).toHaveLength(0)
			},
		)
	})

	// ==========================================================================
	// 3. NOT triggered when -webkit-line-clamp is used
	// ==========================================================================

	describe("-webkit-line-clamp exemption", () => {
		test(
			"does not report when -webkit-line-clamp is applied",
			{ timeout: 60_000 },
			async () => {
				const result = await lintHtml(
					`
<style>
  #clamped {
    width: 180px;
    font: 16px/18px monospace;
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }
</style>

<div id="clamped">
  THIS IS A VERY VERY VERY VERY VERY VERY VERY VERY VERY LONG BLOCK OF TEXT THAT WRAPS ACROSS MULTIPLE LINES AND SHOULD BE CLAMPED
</div>
`,
					{ "rules/clipped-content": "error" },
				)

				expect(result?.messages ?? []).toHaveLength(0)
			},
		)

		test("does not report single-line clamp", { timeout: 60_000 }, async () => {
			const result = await lintHtml(
				`
<style>
  #clamped {
    width: 180px;
    font: 16px/18px monospace;
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 1;
  }
</style>

<div id="clamped">
  THIS IS A VERY VERY VERY VERY VERY VERY VERY VERY VERY LONG BLOCK OF TEXT THAT WRAPS
</div>
`,
				{ "rules/clipped-content": "error" },
			)

			expect(result?.messages ?? []).toHaveLength(0)
		})
	})

	// ==========================================================================
	// 4. NOT triggered when nested inside an intentionally clipped parent
	// ==========================================================================

	describe("intentionally clipped parent exemption", () => {
		test(
			"does not report nested clipping element when parent has border-radius",
			{ timeout: 60_000 },
			async () => {
				// The outer #clipper is intentionally clipped (has border-radius)
				// The inner #inner has overflow:hidden but should not be reported
				// because its parent is intentionally clipped
				const result = await lintHtml(
					`
<style>
  #clipper {
    width: 150px;
    height: 80px;
    overflow: hidden;
    border-radius: 12px;
    border: 1px solid #000;
  }
  #inner {
    width: 100px;
    overflow: hidden;
    white-space: nowrap;
    font: 16px/1 monospace;
  }
</style>

<div id="clipper">
  <div id="inner">THIS IS A VERY VERY VERY VERY VERY LONG LINE OF TEXT</div>
</div>
`,
					{ "rules/clipped-content": "error" },
				)

				expect(result?.messages ?? []).toHaveLength(0)
			},
		)

		test(
			"does not report nested clipping element when parent has background",
			{ timeout: 60_000 },
			async () => {
				const result = await lintHtml(
					`
<style>
  #clipper {
    width: 150px;
    height: 80px;
    overflow: hidden;
    background: #f0f0f0;
    border: 1px solid #000;
  }
  #inner {
    width: 100px;
    overflow: hidden;
    white-space: nowrap;
    font: 16px/1 monospace;
  }
</style>

<div id="clipper">
  <div id="inner">THIS IS A VERY VERY VERY VERY VERY LONG LINE OF TEXT</div>
</div>
`,
					{ "rules/clipped-content": "error" },
				)

				expect(result?.messages ?? []).toHaveLength(0)
			},
		)

		test(
			"does not report nested clipping element when parent is positioned",
			{ timeout: 60_000 },
			async () => {
				const result = await lintHtml(
					`
<style>
  #clipper {
    position: relative;
    width: 150px;
    height: 80px;
    overflow: hidden;
    border: 1px solid #000;
  }
  #inner {
    width: 100px;
    overflow: hidden;
    white-space: nowrap;
    font: 16px/1 monospace;
  }
</style>

<div id="clipper">
  <div id="inner">THIS IS A VERY VERY VERY VERY VERY LONG LINE OF TEXT</div>
</div>
`,
					{ "rules/clipped-content": "error" },
				)

				expect(result?.messages ?? []).toHaveLength(0)
			},
		)

		test(
			"does not report nested clipping element when parent has clip-path",
			{ timeout: 60_000 },
			async () => {
				const result = await lintHtml(
					`
<style>
  #clipper {
    width: 150px;
    height: 80px;
    overflow: hidden;
    clip-path: inset(0);
    border: 1px solid #000;
  }
  #inner {
    width: 100px;
    overflow: hidden;
    white-space: nowrap;
    font: 16px/1 monospace;
  }
</style>

<div id="clipper">
  <div id="inner">THIS IS A VERY VERY VERY VERY VERY LONG LINE OF TEXT</div>
</div>
`,
					{ "rules/clipped-content": "error" },
				)

				expect(result?.messages ?? []).toHaveLength(0)
			},
		)

		test(
			"does not report when parent has data-viewlint-clipped attribute",
			{ timeout: 60_000 },
			async () => {
				const result = await lintHtml(
					`
<style>
  #clipper {
    width: 150px;
    height: 80px;
    overflow: hidden;
  }
  #inner {
    width: 100px;
    overflow: hidden;
    white-space: nowrap;
    font: 16px/1 monospace;
  }
</style>

<div id="clipper" data-viewlint-clipped>
  <div id="inner">THIS IS A VERY VERY VERY VERY VERY LONG LINE OF TEXT</div>
</div>
`,
					{ "rules/clipped-content": "error" },
				)

				expect(result?.messages ?? []).toHaveLength(0)
			},
		)
	})

	// ==========================================================================
	// 5. NOT triggered for media in rounded containers (avatar/thumbnail patterns)
	// ==========================================================================

	describe("media in rounded containers exemption", () => {
		test(
			"does not report avatar-like image in circular container",
			{ timeout: 60_000 },
			async () => {
				const result = await lintHtml(
					`
<style>
  .avatar {
    display: block;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    overflow: hidden;
    background: #fff;
  }
  .avatar img {
    width: 100%;
    height: 49px; /* Slightly taller to trigger minor clip */
  }
</style>

<span class="avatar">
  <img alt="" src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='48' height='49'><rect width='48' height='49' fill='blue'/></svg>">
</span>
`,
					{ "rules/clipped-content": "error" },
				)

				expect(result?.messages ?? []).toHaveLength(0)
			},
		)

		test(
			"does not report thumbnail image in rounded container",
			{ timeout: 60_000 },
			async () => {
				const result = await lintHtml(
					`
<style>
  #thumb {
    width: 200px;
    height: 100px;
    overflow: hidden;
    border-radius: 12px;
    border: 1px solid #000;
  }
  #thumb img {
    display: block;
    width: 200px;
    height: 102px; /* Slightly taller */
  }
</style>

<div id="thumb">
  <img alt="" src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='102'><rect width='200' height='102' fill='green'/></svg>">
</div>
`,
					{ "rules/clipped-content": "error" },
				)

				expect(result?.messages ?? []).toHaveLength(0)
			},
		)

		test(
			"does not report video in rounded container",
			{ timeout: 60_000 },
			async () => {
				const result = await lintHtml(
					`
<style>
  #video-container {
    width: 300px;
    height: 200px;
    overflow: hidden;
    border-radius: 16px;
    background: #000;
  }
  #video-container video {
    width: 300px;
    height: 201px;
  }
</style>

<div id="video-container">
  <video width="300" height="201"></video>
</div>
`,
					{ "rules/clipped-content": "error" },
				)

				expect(result?.messages ?? []).toHaveLength(0)
			},
		)

		test(
			"does not report canvas in rounded container",
			{ timeout: 60_000 },
			async () => {
				const result = await lintHtml(
					`
<style>
  #canvas-container {
    width: 150px;
    height: 150px;
    overflow: hidden;
    border-radius: 8px;
    background: #f0f0f0;
  }
  #canvas-container canvas {
    width: 150px;
    height: 151px;
  }
</style>

<div id="canvas-container">
  <canvas width="150" height="151"></canvas>
</div>
`,
					{ "rules/clipped-content": "error" },
				)

				expect(result?.messages ?? []).toHaveLength(0)
			},
		)
	})

	// ==========================================================================
	// 6. NOT triggered for symmetric horizontal clipping (gutter patterns)
	// ==========================================================================

	describe("symmetric gutter clipping exemption", () => {
		test(
			"does not report symmetric negative margin gutters",
			{ timeout: 60_000 },
			async () => {
				const result = await lintHtml(
					`
<style>
  #clip {
    width: 200px;
    overflow-x: hidden;
    border: 1px solid #000;
  }
  #inner {
    margin-left: -12px;
    margin-right: -12px;
    height: 20px;
    background: #eee;
  }
</style>

<div id="clip">
  <div id="inner"></div>
</div>
`,
					{ "rules/clipped-content": "error" },
				)

				expect(result?.messages ?? []).toHaveLength(0)
			},
		)

		test(
			"does not report symmetric horizontal overflow pattern",
			{ timeout: 60_000 },
			async () => {
				const result = await lintHtml(
					`
<style>
  #container {
    width: 200px;
    overflow: hidden;
    border: 1px solid #000;
  }
  #row {
    display: flex;
    margin: 0 -10px;
  }
  .col {
    flex: 1;
    padding: 0 10px;
  }
</style>

<div id="container">
  <div id="row">
    <div class="col">A</div>
    <div class="col">B</div>
    <div class="col">C</div>
  </div>
</div>
`,
					{ "rules/clipped-content": "error" },
				)

				expect(result?.messages ?? []).toHaveLength(0)
			},
		)

		test(
			"reports asymmetric clipping (only right side)",
			{ timeout: 60_000 },
			async () => {
				const result = await lintHtml(
					`
<style>
  #container {
    width: 100px;
    overflow: hidden;
    white-space: nowrap;
    font: 16px/1 monospace;
  }
</style>

<div id="container">VERY LONG TEXT THAT ONLY OVERFLOWS RIGHT</div>
`,
					{ "rules/clipped-content": "error" },
				)

				const messages = result?.messages ?? []
				expect(messages.length).toBeGreaterThan(0)
				expect(messages.some((m) => m.ruleId === "rules/clipped-content")).toBe(
					true,
				)
			},
		)
	})

	// ==========================================================================
	// 7. Triggered when clipping is unintentional
	// ==========================================================================

	describe("unintentional clipping detection", () => {
		test(
			"reports clipping with just overflow:hidden and no styling cues",
			{ timeout: 60_000 },
			async () => {
				const result = await lintHtml(
					`
<style>
  #box {
    width: 120px;
    overflow: hidden;
    white-space: nowrap;
    font: 16px/1 monospace;
  }
</style>

<div id="box">THIS IS A VERY VERY VERY VERY VERY VERY LONG LINE OF TEXT</div>
`,
					{ "rules/clipped-content": "error" },
				)

				const messages = result?.messages ?? []
				expect(messages.length).toBeGreaterThan(0)
				expect(messages.some((m) => m.ruleId === "rules/clipped-content")).toBe(
					true,
				)
			},
		)

		test(
			"reports clipping on plain container without decoration",
			{ timeout: 60_000 },
			async () => {
				const result = await lintHtml(
					`
<style>
  #plain {
    width: 100px;
    height: 50px;
    overflow: hidden;
  }
  #content {
    width: 200px;
    height: 100px;
    background: #ccc;
  }
</style>

<div id="plain">
  <div id="content">Big content</div>
</div>
`,
					{ "rules/clipped-content": "error" },
				)

				const messages = result?.messages ?? []
				expect(messages.length).toBeGreaterThan(0)
				expect(messages.some((m) => m.ruleId === "rules/clipped-content")).toBe(
					true,
				)
			},
		)
	})

	// ==========================================================================
	// 8. Properly handles absolute children that overflow
	// ==========================================================================

	describe("absolute positioned children handling", () => {
		test(
			"does not report when absolute child overflows intentionally clipped parent",
			{ timeout: 60_000 },
			async () => {
				const result = await lintHtml(
					`
<style>
  #clipper {
    position: relative;
    width: 120px;
    height: 50px;
    overflow: hidden;
    border-radius: 12px;
    border: 1px solid #000;
    background: #fff;
  }
  #btn {
    position: absolute;
    left: -30px;
    top: 10px;
    width: 80px;
    height: 30px;
  }
</style>

<div id="clipper">
  <button id="btn">Click</button>
</div>
`,
					{ "rules/clipped-content": "error" },
				)

				expect(result?.messages ?? []).toHaveLength(0)
			},
		)

		test(
			"does not report when absolute child causes scrollWidth overflow",
			{ timeout: 60_000 },
			async () => {
				const result = await lintHtml(
					`
<style>
  #container {
    position: relative;
    width: 200px;
    height: 100px;
    overflow: hidden;
    border: 1px solid #000;
    background: #f5f5f5;
  }
  #popup {
    position: absolute;
    right: -50px;
    top: 20px;
    width: 100px;
    height: 60px;
    background: #eee;
  }
</style>

<div id="container">
  <div id="popup">Positioned element</div>
</div>
`,
					{ "rules/clipped-content": "error" },
				)

				expect(result?.messages ?? []).toHaveLength(0)
			},
		)
	})

	// ==========================================================================
	// 9. Handles vertical text clipping with font-size-based threshold
	// ==========================================================================

	describe("font-size-based vertical clipping threshold", () => {
		test(
			"does not report minor vertical clipping below font threshold",
			{ timeout: 60_000 },
			async () => {
				// With 16px font, threshold is max(3, 16*0.2) = 3.2px
				// The inner div is 19px tall in a 17px container = 2px clip
				// This should not trigger since 2px < 3.2px threshold
				const result = await lintHtml(
					`
<style>
  #container {
    width: 200px;
    height: 17px;
    overflow: hidden;
    font: 16px/1 sans-serif;
  }
  #inner {
    height: 19px;
  }
</style>

<div id="container">
  <div id="inner">Text</div>
</div>
`,
					{ "rules/clipped-content": "error" },
				)

				expect(result?.messages ?? []).toHaveLength(0)
			},
		)

		test(
			"reports vertical clipping above font threshold",
			{ timeout: 60_000 },
			async () => {
				// With 16px font, threshold is max(3, 16*0.2) = 3.2px
				// Significant clipping should trigger
				const result = await lintHtml(
					`
<style>
  #container {
    width: 200px;
    height: 20px;
    overflow: hidden;
    font: 16px/1.5 sans-serif;
  }
</style>

<div id="container">
  <p style="margin: 0;">Line 1</p>
  <p style="margin: 0;">Line 2</p>
</div>
`,
					{ "rules/clipped-content": "error" },
				)

				const messages = result?.messages ?? []
				expect(messages.length).toBeGreaterThan(0)
				expect(messages.some((m) => m.ruleId === "rules/clipped-content")).toBe(
					true,
				)
			},
		)

		test(
			"uses larger font for larger threshold",
			{ timeout: 60_000 },
			async () => {
				// With 40px font, threshold is max(3, 40*0.2) = 8px
				// 6px clip should not trigger
				const result = await lintHtml(
					`
<style>
  #container {
    width: 300px;
    height: 44px;
    overflow: hidden;
    font: 40px/1 sans-serif;
  }
</style>

<div id="container">Large text</div>
`,
					{ "rules/clipped-content": "error" },
				)

				expect(result?.messages ?? []).toHaveLength(0)
			},
		)
	})

	// ==========================================================================
	// 10. Reports correct clipping amounts (horizontal/vertical)
	// ==========================================================================

	describe("clipping amount reporting", () => {
		test(
			"reports horizontal clipping amount in pixels",
			{ timeout: 60_000 },
			async () => {
				const result = await lintHtml(
					`
<style>
  #container {
    width: 100px;
    overflow: hidden;
    white-space: nowrap;
    font: 16px/1 monospace;
  }
</style>

<div id="container">THIS IS VERY LONG TEXT THAT OVERFLOWS</div>
`,
					{ "rules/clipped-content": "error" },
				)

				const messages = result?.messages ?? []
				expect(messages.length).toBeGreaterThan(0)

				const clippedMessage = messages.find(
					(m) => m.ruleId === "rules/clipped-content",
				)
				expect(clippedMessage).toBeDefined()
				expect(clippedMessage?.message).toMatch(/\d+px horizontally/)
			},
		)

		test(
			"reports vertical clipping amount in pixels",
			{ timeout: 60_000 },
			async () => {
				const result = await lintHtml(
					`
<style>
  #container {
    width: 200px;
    height: 30px;
    overflow: hidden;
    font: 16px/1.5 sans-serif;
  }
</style>

<div id="container">
  <p style="margin: 0;">Line 1</p>
  <p style="margin: 0;">Line 2</p>
  <p style="margin: 0;">Line 3</p>
</div>
`,
					{ "rules/clipped-content": "error" },
				)

				const messages = result?.messages ?? []
				expect(messages.length).toBeGreaterThan(0)

				const clippedMessage = messages.find(
					(m) => m.ruleId === "rules/clipped-content",
				)
				expect(clippedMessage).toBeDefined()
				expect(clippedMessage?.message).toMatch(/\d+px vertically/)
			},
		)

		test(
			"reports both horizontal and vertical amounts",
			{ timeout: 60_000 },
			async () => {
				const result = await lintHtml(
					`
<style>
  #container {
    width: 100px;
    height: 50px;
    overflow: hidden;
    font: 16px/1 monospace;
  }
  #inner {
    width: 250px;
    height: 150px;
    background: #eee;
  }
</style>

<div id="container">
  <div id="inner">Large block</div>
</div>
`,
					{ "rules/clipped-content": "error" },
				)

				const messages = result?.messages ?? []
				expect(messages.length).toBeGreaterThan(0)

				const clippedMessage = messages.find(
					(m) => m.ruleId === "rules/clipped-content",
				)
				expect(clippedMessage).toBeDefined()
				expect(clippedMessage?.message).toMatch(/\d+px horizontally/)
				expect(clippedMessage?.message).toMatch(/\d+px vertically/)
			},
		)
	})

	// ==========================================================================
	// Additional edge cases
	// ==========================================================================

	describe("edge cases", () => {
		test(
			"does not report on scrollable containers (overflow:auto/scroll)",
			{ timeout: 60_000 },
			async () => {
				const result = await lintHtml(
					`
<style>
  #scrollable {
    width: 100px;
    height: 50px;
    overflow: auto;
    font: 16px/1 monospace;
  }
  #content {
    width: 200px;
    height: 100px;
  }
</style>

<div id="scrollable">
  <div id="content">Scrollable content</div>
</div>
`,
					{ "rules/clipped-content": "error" },
				)

				expect(result?.messages ?? []).toHaveLength(0)
			},
		)

		test(
			"does not report on overflow:visible",
			{ timeout: 60_000 },
			async () => {
				const result = await lintHtml(
					`
<style>
  #container {
    width: 100px;
    overflow: visible;
    font: 16px/1 monospace;
  }
</style>

<div id="container">THIS IS VERY LONG TEXT THAT OVERFLOWS BUT IS VISIBLE</div>
`,
					{ "rules/clipped-content": "error" },
				)

				expect(result?.messages ?? []).toHaveLength(0)
			},
		)

		test(
			"does not report on invisible elements",
			{ timeout: 60_000 },
			async () => {
				const result = await lintHtml(
					`
<style>
  #hidden {
    display: none;
    width: 100px;
    overflow: hidden;
  }
</style>

<div id="hidden">THIS IS VERY LONG TEXT THAT WOULD OVERFLOW</div>
`,
					{ "rules/clipped-content": "error" },
				)

				expect(result?.messages ?? []).toHaveLength(0)
			},
		)

		test(
			"does not report on visually hidden accessibility patterns",
			{ timeout: 60_000 },
			async () => {
				const result = await lintHtml(
					`
<style>
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>

<span class="sr-only">THIS IS A VERY VERY VERY VERY VERY VERY LONG ACCESSIBILITY LABEL</span>
`,
					{ "rules/clipped-content": "error" },
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
    width: 100px;
    height: 50px;
    overflow-x: hidden;
    overflow-y: auto;
    white-space: nowrap;
    font: 16px/1 monospace;
  }
</style>

<div id="container">THIS IS A VERY VERY VERY VERY VERY LONG LINE</div>
`,
					{ "rules/clipped-content": "error" },
				)

				const messages = result?.messages ?? []
				expect(messages.length).toBeGreaterThan(0)
				expect(messages.some((m) => m.message.includes("horizontally"))).toBe(
					true,
				)
				// Should not report vertical since overflow-y is auto
				expect(messages.every((m) => !m.message.includes("vertically"))).toBe(
					true,
				)
			},
		)

		test(
			"does not report when no actual content overflows",
			{ timeout: 60_000 },
			async () => {
				const result = await lintHtml(
					`
<style>
  #container {
    width: 200px;
    height: 100px;
    overflow: hidden;
  }
  #content {
    width: 100px;
    height: 50px;
    background: #eee;
  }
</style>

<div id="container">
  <div id="content">Small content that fits</div>
</div>
`,
					{ "rules/clipped-content": "error" },
				)

				expect(result?.messages ?? []).toHaveLength(0)
			},
		)
	})
})
