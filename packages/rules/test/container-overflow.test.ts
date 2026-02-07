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

describe("@viewlint/rules container-overflow", () => {
	// 1. Basic overflow detection - child element larger than parent
	test(
		"detects child element overflowing parent container",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #parent {
    width: 100px;
    height: 100px;
    border: 1px solid #000;
  }
  #child {
    width: 150px;
    height: 150px;
    background: #ccc;
  }
</style>

<div id="parent">
  <div id="child"></div>
</div>
`,
				{
					"rules/container-overflow": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			expect(
				messages.some((m) => m.ruleId === "rules/container-overflow"),
			).toBe(true)
		},
	)

	// 2. NOT triggered for absolutely/fixed/sticky positioned elements
	test(
		"ignores absolutely positioned elements",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #parent {
    position: relative;
    width: 100px;
    height: 100px;
    border: 1px solid #000;
  }
  #child {
    position: absolute;
    width: 150px;
    height: 150px;
    background: #ccc;
  }
</style>

<div id="parent">
  <div id="child"></div>
</div>
`,
				{
					"rules/container-overflow": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test("ignores fixed positioned elements", { timeout: 60_000 }, async () => {
		const result = await lintHtml(
			`
<style>
  #parent {
    width: 100px;
    height: 100px;
    border: 1px solid #000;
  }
  #child {
    position: fixed;
    width: 150px;
    height: 150px;
    background: #ccc;
  }
</style>

<div id="parent">
  <div id="child"></div>
</div>
`,
			{
				"rules/container-overflow": "error",
			},
		)

		expect(result?.messages ?? []).toHaveLength(0)
	})

	test("ignores sticky positioned elements", { timeout: 60_000 }, async () => {
		const result = await lintHtml(
			`
<style>
  #parent {
    width: 100px;
    height: 100px;
    border: 1px solid #000;
  }
  #child {
    position: sticky;
    top: 0;
    width: 150px;
    height: 150px;
    background: #ccc;
  }
</style>

<div id="parent">
  <div id="child"></div>
</div>
`,
			{
				"rules/container-overflow": "error",
			},
		)

		expect(result?.messages ?? []).toHaveLength(0)
	})

	// 3. NOT triggered for BODY/HTML parents
	test("ignores overflow from BODY element", { timeout: 60_000 }, async () => {
		const result = await lintHtml(
			`
<style>
  body {
    margin: 0;
    padding: 0;
  }
  #content {
    width: 2000px;
    height: 2000px;
    background: #ccc;
  }
</style>

<div id="content"></div>
`,
			{
				"rules/container-overflow": "error",
			},
		)

		// Should not report overflow from body - that's normal for scrollable pages
		const messages = result?.messages ?? []
		const bodyOverflowMessages = messages.filter(
			(m) =>
				m.ruleId === "rules/container-overflow" &&
				m.message.includes("overflows"),
		)
		expect(bodyOverflowMessages).toHaveLength(0)
	})

	// 4. NOT triggered when parent has text-overflow:ellipsis
	test(
		"ignores overflow when parent has text-overflow: ellipsis",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #parent {
    width: 100px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    border: 1px solid #000;
  }
  #child {
    display: inline-block;
    width: 200px;
  }
</style>

<div id="parent">
  <span id="child">This is very long text that will overflow</span>
</div>
`,
				{
					"rules/container-overflow": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"ignores overflow when element itself has text-overflow: ellipsis",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #parent {
    width: 100px;
    border: 1px solid #000;
  }
  #child {
    width: 200px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
</style>

<div id="parent">
  <div id="child">This is very long text that will overflow</div>
</div>
`,
				{
					"rules/container-overflow": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	// 5. NOT triggered when parent is intentionally clipped
	test(
		"ignores overflow when parent is intentionally clipped (border-radius)",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #clipper {
    width: 100px;
    height: 100px;
    overflow: hidden;
    border-radius: 12px;
    border: 1px solid #000;
  }
  #child {
    width: 150px;
    height: 150px;
    background: #ccc;
  }
</style>

<div id="clipper">
  <div id="child"></div>
</div>
`,
				{
					"rules/container-overflow": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"ignores overflow when ancestor is intentionally clipped",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #outer {
    width: 100px;
    height: 100px;
    overflow: hidden;
    border-radius: 12px;
    border: 1px solid #000;
  }
  #parent {
    width: 100px;
    height: 100px;
  }
  #child {
    width: 150px;
    height: 150px;
    background: #ccc;
  }
</style>

<div id="outer">
  <div id="parent">
    <div id="child"></div>
  </div>
</div>
`,
				{
					"rules/container-overflow": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	// 6. NOT triggered for offscreen positioned elements (skip links pattern)
	test(
		"ignores offscreen positioned elements (skip links pattern)",
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
  #skiplink {
    position: absolute;
    left: -9999px;
    top: -9999px;
    width: 300px;
    height: 30px;
    background: #ccc;
  }
  #skiplink:focus {
    left: 0;
    top: 0;
  }
</style>

<div id="parent">
  <a id="skiplink" href="#main">Skip to main content</a>
</div>
`,
				{
					"rules/container-overflow": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"ignores elements positioned far offscreen with negative top",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #parent {
    position: relative;
    width: 200px;
    height: 50px;
    border: 1px solid #000;
  }
  #hidden {
    position: absolute;
    top: -1000px;
    width: 300px;
    height: 30px;
    background: #ccc;
  }
</style>

<div id="parent">
  <div id="hidden">Visually hidden content</div>
</div>
`,
				{
					"rules/container-overflow": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	// 7. NOT triggered for negative margin clipping patterns
	test(
		"ignores negative margin clipping patterns",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #parent {
    width: 200px;
    overflow-x: hidden;
    border: 1px solid #000;
  }
  #child {
    margin-left: -20px;
    margin-right: -20px;
    height: 50px;
    background: #ccc;
  }
</style>

<div id="parent">
  <div id="child"></div>
</div>
`,
				{
					"rules/container-overflow": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"ignores symmetric negative margin clipping",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #parent {
    width: 200px;
    overflow: hidden;
    border: 1px solid #000;
  }
  #child {
    margin: -15px;
    height: 50px;
    background: #ccc;
  }
</style>

<div id="parent">
  <div id="child"></div>
</div>
`,
				{
					"rules/container-overflow": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	// 8. NOT triggered for symmetric horizontal overflow
	test(
		"ignores symmetric horizontal overflow in visible overflow containers",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #parent {
    display: flex;
    justify-content: center;
    width: 100px;
    overflow: visible;
    border: 1px solid #000;
  }
  #child {
    width: 140px;
    height: 50px;
    background: #ccc;
  }
</style>

<div id="parent">
  <div id="child"></div>
</div>
`,
				{
					"rules/container-overflow": "error",
				},
			)

			// Symmetric overflow is ignored via the isSymmetricHorizontalOverflow check
			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	// 9. Higher threshold for visible overflow containers
	test(
		"uses higher threshold (20px) for visible overflow containers",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #parent {
    display: flex;
    width: 100px;
    height: 100px;
    overflow: visible;
    border: 1px solid #000;
  }
  #child {
    width: 115px;
    height: 50px;
    background: #ccc;
  }
</style>

<div id="parent">
  <div id="child"></div>
</div>
`,
				{
					"rules/container-overflow": "error",
				},
			)

			// 15px overflow is below the 20px threshold for visible overflow
			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"reports overflow exceeding visible overflow threshold (>20px)",
		{ timeout: 60_000 },
		async () => {
			// Uses flex with align-items: flex-start to avoid symmetric centering
			// Child uses flex-shrink: 0 to prevent shrinking
			// Nested in wrapper to avoid body interactions
			const result = await lintHtml(
				`
<style>
  #wrapper {
    width: 300px;
    height: 300px;
  }
  #parent {
    display: flex;
    align-items: flex-start;
    width: 100px;
    height: 100px;
    overflow: visible;
  }
  #child {
    flex-shrink: 0;
    width: 200px;
    height: 50px;
    background: #ccc;
  }
</style>

<div id="wrapper">
  <div id="parent">
    <div id="child"></div>
  </div>
</div>
`,
				{
					"rules/container-overflow": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			expect(
				messages.some((m) => m.ruleId === "rules/container-overflow"),
			).toBe(true)
		},
	)

	// 10. Reports overflow with correct direction amounts (top/right/bottom/left)
	test(
		"reports correct overflow direction - right overflow",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #parent {
    width: 100px;
    height: 100px;
    border: 1px solid #000;
  }
  #child {
    width: 150px;
    height: 50px;
    background: #ccc;
  }
</style>

<div id="parent">
  <div id="child"></div>
</div>
`,
				{
					"rules/container-overflow": "error",
				},
			)

			const messages = result?.messages ?? []
			const overflowMessage = messages.find(
				(m) => m.ruleId === "rules/container-overflow",
			)
			expect(overflowMessage).toBeDefined()
			expect(overflowMessage?.message).toContain("right")
		},
	)

	test(
		"reports correct overflow direction - bottom overflow",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #parent {
    width: 100px;
    height: 100px;
    border: 1px solid #000;
  }
  #child {
    width: 50px;
    height: 150px;
    background: #ccc;
  }
</style>

<div id="parent">
  <div id="child"></div>
</div>
`,
				{
					"rules/container-overflow": "error",
				},
			)

			const messages = result?.messages ?? []
			const overflowMessage = messages.find(
				(m) => m.ruleId === "rules/container-overflow",
			)
			expect(overflowMessage).toBeDefined()
			expect(overflowMessage?.message).toContain("bottom")
		},
	)

	test(
		"reports multiple overflow directions",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #parent {
    width: 100px;
    height: 100px;
    border: 1px solid #000;
  }
  #child {
    width: 150px;
    height: 150px;
    background: #ccc;
  }
</style>

<div id="parent">
  <div id="child"></div>
</div>
`,
				{
					"rules/container-overflow": "error",
				},
			)

			const messages = result?.messages ?? []
			const overflowMessage = messages.find(
				(m) => m.ruleId === "rules/container-overflow",
			)
			expect(overflowMessage).toBeDefined()
			expect(overflowMessage?.message).toContain("right")
			expect(overflowMessage?.message).toContain("bottom")
		},
	)

	// 11. Includes "Container" relation in report
	test(
		"includes Container relation in report",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #parent {
    width: 100px;
    height: 100px;
    border: 1px solid #000;
  }
  #child {
    width: 150px;
    height: 150px;
    background: #ccc;
  }
</style>

<div id="parent">
  <div id="child"></div>
</div>
`,
				{
					"rules/container-overflow": "error",
				},
			)

			const messages = result?.messages ?? []
			const overflowMessage = messages.find(
				(m) => m.ruleId === "rules/container-overflow",
			)
			expect(overflowMessage).toBeDefined()
			expect(overflowMessage?.relations).toBeDefined()
			expect(overflowMessage?.relations?.length).toBeGreaterThan(0)
			expect(
				overflowMessage?.relations?.some((r) => r.description === "Container"),
			).toBe(true)
		},
	)

	// 12. Checks layout containers only for visible overflow
	test(
		"only checks layout containers (flex) for visible overflow",
		{ timeout: 60_000 },
		async () => {
			// Uses flex with align-items: flex-start to avoid symmetric centering
			// Child uses flex-shrink: 0 to prevent shrinking
			// Nested in wrapper to avoid body interactions
			const result = await lintHtml(
				`
<style>
  #wrapper {
    width: 300px;
    height: 300px;
  }
  #parent {
    display: flex;
    align-items: flex-start;
    width: 100px;
    height: 100px;
    overflow: visible;
  }
  #child {
    flex-shrink: 0;
    width: 200px;
    height: 50px;
    background: #ccc;
  }
</style>

<div id="wrapper">
  <div id="parent">
    <div id="child"></div>
  </div>
</div>
`,
				{
					"rules/container-overflow": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(
				messages.some((m) => m.ruleId === "rules/container-overflow"),
			).toBe(true)
		},
	)

	test(
		"only checks layout containers (grid) for visible overflow",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #parent {
    display: grid;
    width: 100px;
    height: 100px;
    overflow: visible;
    border: 1px solid #000;
  }
  #child {
    width: 200px;
    height: 50px;
    background: #ccc;
  }
</style>

<div id="parent">
  <div id="child"></div>
</div>
`,
				{
					"rules/container-overflow": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(
				messages.some((m) => m.ruleId === "rules/container-overflow"),
			).toBe(true)
		},
	)

	test(
		"ignores non-layout containers with visible overflow",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #parent {
    display: block;
    overflow: visible;
    border: 1px solid #000;
  }
  #child {
    width: 200px;
    height: 50px;
    background: #ccc;
  }
</style>

<div id="parent">
  <div id="child"></div>
</div>
`,
				{
					"rules/container-overflow": "error",
				},
			)

			// Non-layout container with visible overflow should be ignored
			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"checks containers with explicit width for visible overflow",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #parent {
    display: block;
    width: 100px;
    height: 100px;
    overflow: visible;
    border: 1px solid #000;
  }
  #child {
    width: 200px;
    height: 50px;
    background: #ccc;
  }
</style>

<div id="parent">
  <div id="child"></div>
</div>
`,
				{
					"rules/container-overflow": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(
				messages.some((m) => m.ruleId === "rules/container-overflow"),
			).toBe(true)
		},
	)

	test(
		"checks containers with max-width for visible overflow",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #parent {
    display: block;
    max-width: 100px;
    height: 100px;
    overflow: visible;
    border: 1px solid #000;
  }
  #child {
    width: 200px;
    height: 50px;
    background: #ccc;
  }
</style>

<div id="parent">
  <div id="child"></div>
</div>
`,
				{
					"rules/container-overflow": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(
				messages.some((m) => m.ruleId === "rules/container-overflow"),
			).toBe(true)
		},
	)

	// Additional edge cases

	test(
		"detects overflow with hidden overflow parent without intentional clipping",
		{ timeout: 60_000 },
		async () => {
			// Note: overflow: hidden + border/background = intentionally clipped
			// So we test with a parent that has overflow: hidden but no decorations
			const result = await lintHtml(
				`
<style>
  #outer {
    width: 100px;
    height: 100px;
  }
  #parent {
    width: 100px;
    height: 100px;
    overflow: hidden;
  }
  #child {
    width: 150px;
    height: 150px;
    background: #ccc;
  }
</style>

<div id="outer">
  <div id="parent">
    <div id="child"></div>
  </div>
</div>
`,
				{
					"rules/container-overflow": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(
				messages.some((m) => m.ruleId === "rules/container-overflow"),
			).toBe(true)
		},
	)

	test(
		"ignores line-clamped ancestor clipping",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #clamped {
    width: 160px;
    font: 16px/18px monospace;
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 1;
  }
  #link {
    display: block;
    height: 18px;
    border: 1px solid #000;
  }
  #tall {
    display: block;
    height: 80px;
  }
</style>

<div id="clamped">
  <a id="link" href="#">
    <span id="tall">Very tall content clipped by line clamp</span>
  </a>
</div>
`,
				{
					"rules/container-overflow": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test("ignores invisible elements", { timeout: 60_000 }, async () => {
		const result = await lintHtml(
			`
<style>
  #parent {
    width: 100px;
    height: 100px;
    border: 1px solid #000;
  }
  #child {
    display: none;
    width: 150px;
    height: 150px;
    background: #ccc;
  }
</style>

<div id="parent">
  <div id="child"></div>
</div>
`,
			{
				"rules/container-overflow": "error",
			},
		)

		expect(result?.messages ?? []).toHaveLength(0)
	})

	test("ignores elements with zero size", { timeout: 60_000 }, async () => {
		const result = await lintHtml(
			`
<style>
  #parent {
    width: 100px;
    height: 100px;
    border: 1px solid #000;
  }
  #child {
    width: 0;
    height: 0;
  }
</style>

<div id="parent">
  <div id="child"></div>
</div>
`,
			{
				"rules/container-overflow": "error",
			},
		)

		expect(result?.messages ?? []).toHaveLength(0)
	})

	test(
		"uses 1px threshold for clipping overflow containers",
		{ timeout: 60_000 },
		async () => {
			// Parent with overflow: hidden but no decoration = not intentionally clipped
			const result = await lintHtml(
				`
<style>
  #outer {
    width: 100px;
    height: 100px;
  }
  #parent {
    width: 100px;
    height: 100px;
    overflow: hidden;
  }
  #child {
    width: 105px;
    height: 50px;
    background: #ccc;
  }
</style>

<div id="outer">
  <div id="parent">
    <div id="child"></div>
  </div>
</div>
`,
				{
					"rules/container-overflow": "error",
				},
			)

			const messages = result?.messages ?? []
			// 5px overflow exceeds the 1px threshold
			expect(
				messages.some((m) => m.ruleId === "rules/container-overflow"),
			).toBe(true)
		},
	)
})
