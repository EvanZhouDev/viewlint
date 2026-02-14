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

describe("@viewlint/rules overlapped-elements", () => {
	test(
		"detects basic overlap between two sibling elements",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    position: relative;
    width: 400px;
    height: 300px;
  }
  #box-a {
    width: 200px;
    height: 100px;
    background: red;
  }
  #box-b {
    width: 200px;
    height: 100px;
    background: blue;
    margin-top: -60px;
  }
</style>

<div id="container">
  <div id="box-a">Box A</div>
  <div id="box-b">Box B</div>
</div>
`,
				{
					"rules/overlapped-elements": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			expect(
				messages.some((m) => m.ruleId === "rules/overlapped-elements"),
			).toBe(true)
		},
	)

	test(
		"does not trigger for absolute positioned elements",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    position: relative;
    width: 400px;
    height: 300px;
  }
  #box-a {
    position: absolute;
    top: 50px;
    left: 50px;
    width: 200px;
    height: 100px;
    background: red;
  }
  #box-b {
    width: 200px;
    height: 100px;
    background: blue;
    margin-top: 30px;
  }
</style>

<div id="container">
  <div id="box-a">Absolute Box A</div>
  <div id="box-b">Box B</div>
</div>
`,
				{
					"rules/overlapped-elements": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"does not trigger for fixed positioned elements",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #fixed-header {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 60px;
    background: red;
  }
  #content {
    width: 200px;
    height: 100px;
    background: blue;
  }
</style>

<div id="fixed-header">Fixed Header</div>
<div id="content">Content</div>
`,
				{
					"rules/overlapped-elements": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"does not trigger for sticky positioned elements",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #sticky-header {
    position: sticky;
    top: 0;
    width: 100%;
    height: 60px;
    background: red;
  }
  #content {
    width: 200px;
    height: 100px;
    background: blue;
    margin-top: -30px;
  }
</style>

<div id="sticky-header">Sticky Header</div>
<div id="content">Content</div>
`,
				{
					"rules/overlapped-elements": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"does not trigger for elements with different layout roots",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #wrapper {
    position: relative;
    width: 400px;
    height: 400px;
  }
  #absolute-container {
    position: absolute;
    top: 0;
    left: 0;
    width: 200px;
    height: 200px;
  }
  #box-a {
    width: 150px;
    height: 100px;
    background: red;
  }
  #box-b {
    width: 150px;
    height: 100px;
    background: blue;
    margin-top: 50px;
  }
</style>

<div id="wrapper">
  <div id="absolute-container">
    <div id="box-a">Box A (inside absolute)</div>
  </div>
  <div id="box-b">Box B (outside absolute)</div>
</div>
`,
				{
					"rules/overlapped-elements": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"does not trigger for parent-child relationships",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #parent {
    width: 200px;
    height: 200px;
    background: red;
    padding: 20px;
  }
  #child {
    width: 100px;
    height: 100px;
    background: blue;
  }
</style>

<div id="parent">
  <div id="child">Child</div>
</div>
`,
				{
					"rules/overlapped-elements": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"does not trigger for float text wrapping patterns",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #img {
    float: left;
    width: 120px;
    height: 80px;
    background: #ccc;
    margin: 0 12px 12px 0;
  }
</style>

<div>
  <div id="img"></div>
  <p>
    This is a long paragraph that should wrap around the floated image.
    It should not count as an overlap bug. The text flows naturally around
    the floated element which is expected behavior.
  </p>
</div>
`,
				{
					"rules/overlapped-elements": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"does not trigger for right-floated text wrapping patterns",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #img {
    float: right;
    width: 120px;
    height: 80px;
    background: #ccc;
    margin: 0 0 12px 12px;
  }
</style>

<div>
  <div id="img"></div>
  <p>
    This is a long paragraph that should wrap around the right-floated image.
    It should not count as an overlap bug. The text flows naturally around
    the floated element which is expected behavior.
  </p>
</div>
`,
				{
					"rules/overlapped-elements": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"does not trigger for thin-strip overlaps (less than 12px)",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #a {
    width: 200px;
    height: 80px;
    background: #eee;
  }
  #b {
    width: 200px;
    height: 200px;
    background: #ddd;
    margin-top: -8px;
  }
</style>

<div id="a">Top</div>
<div id="b">Bottom</div>
`,
				{
					"rules/overlapped-elements": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"does not trigger for thin-strip overlaps (less than 20% of smaller element)",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #a {
    width: 200px;
    height: 50px;
    background: #eee;
  }
  #b {
    width: 200px;
    height: 300px;
    background: #ddd;
    margin-top: -9px;
  }
</style>

<div id="a">Small Top (50px tall)</div>
<div id="b">Large Bottom (300px tall)</div>
`,
				{
					"rules/overlapped-elements": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"does not trigger for negative margin overlaps under 50% of smaller element",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #a {
    width: 200px;
    height: 100px;
    background: #eee;
  }
  #b {
    width: 200px;
    height: 100px;
    background: #ddd;
    margin-top: -40px;
  }
</style>

<div id="a">Top</div>
<div id="b">Bottom with negative margin</div>
`,
				{
					"rules/overlapped-elements": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"triggers for negative margin overlaps at or above 50% of smaller element",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #a {
    width: 200px;
    height: 100px;
    background: #eee;
  }
  #b {
    width: 200px;
    height: 100px;
    background: #ddd;
    margin-top: -55px;
  }
</style>

<div id="a">Top</div>
<div id="b">Bottom with large negative margin</div>
`,
				{
					"rules/overlapped-elements": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			expect(
				messages.some((m) => m.ruleId === "rules/overlapped-elements"),
			).toBe(true)
		},
	)

	test(
		"does not trigger when parent already overlaps the other element",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #parent {
    width: 200px;
    height: 100px;
    background: rgba(255, 0, 0, 0.3);
  }
  #child {
    width: 150px;
    height: 80px;
    background: rgba(255, 0, 0, 0.5);
  }
  #sibling {
    width: 200px;
    height: 100px;
    background: blue;
    margin-top: -60px;
  }
</style>

<div id="parent">
  <div id="child">Child</div>
</div>
<div id="sibling">Sibling</div>
`,
				{
					"rules/overlapped-elements": "error",
				},
			)

			// Parent overlaps sibling, so child should not separately report overlap with sibling
			// The parent-sibling overlap should be reported, but not child-sibling
			const messages = result?.messages ?? []
			// At most one message for parent-sibling overlap
			expect(messages.length).toBeLessThanOrEqual(1)
		},
	)

	test(
		"reports overlap percentage correctly in message",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #a {
    width: 100px;
    height: 100px;
    background: red;
  }
  #b {
    width: 100px;
    height: 100px;
    background: blue;
    margin-top: -80px;
  }
</style>

<div id="a">Box A</div>
<div id="b">Box B</div>
`,
				{
					"rules/overlapped-elements": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			const overlapMessage = messages.find(
				(m) => m.ruleId === "rules/overlapped-elements",
			)
			expect(overlapMessage).toBeDefined()
			expect(overlapMessage?.message).toMatch(/overlap by \d+%/)
		},
	)

	test(
		"includes 'Overlapping element' relation in report",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #a {
    width: 100px;
    height: 100px;
    background: red;
  }
  #b {
    width: 100px;
    height: 100px;
    background: blue;
    margin-top: -70px;
  }
</style>

<div id="a">Box A</div>
<div id="b">Box B</div>
`,
				{
					"rules/overlapped-elements": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			const overlapMessage = messages.find(
				(m) => m.ruleId === "rules/overlapped-elements",
			)
			expect(overlapMessage).toBeDefined()
			expect(overlapMessage?.relations).toBeDefined()
			expect(overlapMessage?.relations?.length).toBeGreaterThan(0)
			expect(
				overlapMessage?.relations?.some(
					(r) => r.description === "Overlapping element",
				),
			).toBe(true)
		},
	)

	test(
		"respects clipping ancestors when calculating visible rects",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #clipper {
    width: 100px;
    height: 50px;
    overflow: hidden;
    border: 1px solid #000;
  }
  #clipped-box {
    width: 100px;
    height: 100px;
    background: red;
  }
  #spacer {
    height: 60px;
  }
  #other-box {
    width: 100px;
    height: 100px;
    background: blue;
  }
</style>

<div id="clipper">
  <div id="clipped-box">Clipped</div>
</div>
<div id="spacer"></div>
<div id="other-box">Other</div>
`,
				{
					"rules/overlapped-elements": "error",
				},
			)

			// The clipped-box is visually cut off at 50px height by the clipper
			// The spacer ensures other-box is positioned below where the clipped-box
			// would have extended without clipping. No overlap should be detected
			// because the visible rect of clipped-box respects the clipping ancestor.
			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"does not trigger for elements completely clipped by overflow:hidden ancestor",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    width: 200px;
    height: 100px;
    overflow: hidden;
    position: relative;
  }
  #visible {
    width: 200px;
    height: 50px;
    background: green;
  }
  #hidden {
    width: 200px;
    height: 50px;
    background: red;
    position: absolute;
    top: 120px;
  }
  #outside {
    width: 200px;
    height: 50px;
    background: blue;
    margin-top: 10px;
  }
</style>

<div id="container">
  <div id="visible">Visible</div>
  <div id="hidden">Hidden (outside clip)</div>
</div>
<div id="outside">Outside</div>
`,
				{
					"rules/overlapped-elements": "error",
				},
			)

			// The hidden element is completely outside the clipping region
			// so no overlap should be detected
			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"triggers for significant overlap between elements in same layout context",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #grid {
    display: grid;
    grid-template-columns: 1fr;
    width: 200px;
  }
  #a {
    grid-row: 1;
    grid-column: 1;
    width: 200px;
    height: 100px;
    background: red;
  }
  #b {
    grid-row: 1;
    grid-column: 1;
    width: 200px;
    height: 100px;
    background: blue;
  }
</style>

<div id="grid">
  <div id="a">Box A</div>
  <div id="b">Box B</div>
</div>
`,
				{
					"rules/overlapped-elements": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			expect(
				messages.some((m) => m.ruleId === "rules/overlapped-elements"),
			).toBe(true)
		},
	)

	test(
		"does not trigger for non-overlapping adjacent elements",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #a {
    width: 100px;
    height: 100px;
    background: red;
  }
  #b {
    width: 100px;
    height: 100px;
    background: blue;
  }
</style>

<div id="a">Box A</div>
<div id="b">Box B</div>
`,
				{
					"rules/overlapped-elements": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"does not trigger for inline elements that do not visually overlap",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  span {
    display: inline-block;
    width: 80px;
    height: 30px;
    background: #eee;
    margin: 5px;
  }
</style>

<div>
  <span>One</span>
  <span>Two</span>
  <span>Three</span>
</div>
`,
				{
					"rules/overlapped-elements": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"handles overlap threshold correctly (5px tolerance)",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #a {
    width: 100px;
    height: 100px;
    background: red;
  }
  #b {
    width: 100px;
    height: 100px;
    background: blue;
    margin-top: -4px;
  }
</style>

<div id="a">Box A</div>
<div id="b">Box B</div>
`,
				{
					"rules/overlapped-elements": "error",
				},
			)

			// 4px overlap is within the 5px threshold, should not trigger
			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"ignores elements smaller than minimum size (10px)",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #large {
    width: 100px;
    height: 100px;
    background: red;
  }
  #tiny {
    width: 8px;
    height: 8px;
    background: blue;
    margin-top: -50px;
  }
</style>

<div id="large">Large Box</div>
<div id="tiny"></div>
`,
				{
					"rules/overlapped-elements": "error",
				},
			)

			// Tiny element (8x8) is below minimum size threshold
			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"does not trigger for overlap below minimum percent threshold (5%)",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #a {
    width: 200px;
    height: 200px;
    background: red;
  }
  #b {
    width: 200px;
    height: 200px;
    background: blue;
    margin-top: -15px;
    margin-left: 150px;
  }
</style>

<div id="a">Large Box A</div>
<div id="b">Large Box B</div>
`,
				{
					"rules/overlapped-elements": "error",
				},
			)

			// Small corner overlap should be below 5% threshold
			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"handles multiple overlapping elements correctly",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  .box {
    width: 100px;
    height: 100px;
  }
  #a {
    background: red;
  }
  #b {
    background: blue;
    margin-top: -60px;
  }
  #c {
    background: green;
    margin-top: -60px;
  }
</style>

<div id="a" class="box">Box A</div>
<div id="b" class="box">Box B</div>
<div id="c" class="box">Box C</div>
`,
				{
					"rules/overlapped-elements": "error",
				},
			)

			const messages = result?.messages ?? []
			// Should detect overlaps: A-B, B-C (possibly A-C too if they overlap)
			expect(messages.length).toBeGreaterThanOrEqual(2)
			expect(
				messages.every((m) => m.ruleId === "rules/overlapped-elements"),
			).toBe(true)
		},
	)

	test("detects horizontal overlaps", { timeout: 60_000 }, async () => {
		const result = await lintHtml(
			`
<style>
  #container {
    display: flex;
  }
  #a {
    width: 100px;
    height: 100px;
    background: red;
    margin-right: -60px;
  }
  #b {
    width: 100px;
    height: 100px;
    background: blue;
  }
</style>

<div id="container">
  <div id="a">Box A</div>
  <div id="b">Box B</div>
</div>
`,
			{
				"rules/overlapped-elements": "error",
			},
		)

		const messages = result?.messages ?? []
		expect(messages.length).toBeGreaterThan(0)
		expect(messages.some((m) => m.ruleId === "rules/overlapped-elements")).toBe(
			true,
		)
	})

	test(
		"handles elements with shape-outside in float context",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #float-img {
    float: left;
    width: 100px;
    height: 100px;
    background: #ccc;
    shape-outside: circle(50%);
    margin-right: 10px;
  }
  p {
    margin: 0;
  }
</style>

<div>
  <div id="float-img"></div>
  <p>
    This text wraps around the circular shape-outside.
    The content flows in an interesting pattern around the floated element.
    This is intentional design behavior, not a bug.
  </p>
</div>
`,
				{
					"rules/overlapped-elements": "error",
				},
			)

			// Float with shape-outside is intentional wrapping pattern
			expect(result?.messages ?? []).toHaveLength(0)
		},
	)
})
