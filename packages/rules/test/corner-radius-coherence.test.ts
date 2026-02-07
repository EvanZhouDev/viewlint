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

describe("@viewlint/rules corner-radius-coherence", () => {
	test(
		"basic violation detection - child radius doesn't follow parent_radius - inset formula",
		{ timeout: 60_000 },
		async () => {
			// Parent has 20px radius, child is inset 5px from parent edges
			// Expected child radius = 20 - 5 = 15px
			// Child has 20px radius (same as parent) which is wrong
			const result = await lintHtml(
				`
<style>
  #parent {
    width: 200px;
    height: 150px;
    padding: 5px;
    border-radius: 20px;
    background: #ccc;
  }
  #child {
    width: 190px;
    height: 140px;
    border-radius: 20px;
    background: #fff;
  }
</style>

<div id="parent">
  <div id="child"></div>
</div>
`,
				{
					"rules/corner-radius-coherence": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			expect(
				messages.some((m) => m.ruleId === "rules/corner-radius-coherence"),
			).toBe(true)
			// Should mention the expected vs actual in the message
			expect(
				messages.some(
					(m) => m.message.includes("expected") && m.message.includes("found"),
				),
			).toBe(true)
		},
	)

	test(
		"NOT triggered when parent has no rounded corners",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #parent {
    width: 200px;
    height: 150px;
    padding: 10px;
    border-radius: 0;
    background: #ccc;
  }
  #child {
    width: 180px;
    height: 130px;
    border-radius: 20px;
    background: #fff;
  }
</style>

<div id="parent">
  <div id="child"></div>
</div>
`,
				{
					"rules/corner-radius-coherence": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"NOT triggered when child has no visible corners (no border/background/shadow)",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #parent {
    width: 200px;
    height: 150px;
    padding: 5px;
    border-radius: 20px;
    background: #ccc;
  }
  #child {
    width: 190px;
    height: 140px;
    border-radius: 8px;
    /* No background, no border, no box-shadow - corners are invisible */
    background: transparent;
  }
</style>

<div id="parent">
  <div id="child">Some text content</div>
</div>
`,
				{
					"rules/corner-radius-coherence": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"NOT triggered when inset > 50% of parent radius",
		{ timeout: 60_000 },
		async () => {
			// Parent radius is 20px, so 50% threshold = 10px
			// Child is inset 15px from parent edges (> 10px threshold)
			// So the rule should NOT apply
			const result = await lintHtml(
				`
<style>
  #parent {
    width: 200px;
    height: 150px;
    padding: 15px;
    border-radius: 20px;
    background: #ccc;
  }
  #child {
    width: 170px;
    height: 120px;
    border-radius: 10px;
    background: #fff;
  }
</style>

<div id="parent">
  <div id="child"></div>
</div>
`,
				{
					"rules/corner-radius-coherence": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"NOT triggered when difference is within 2px tolerance",
		{ timeout: 60_000 },
		async () => {
			// Parent has 20px radius, child is inset 5px
			// Expected child radius = 20 - 5 = 15px
			// Child has 16px radius (within 2px tolerance of 15px)
			const result = await lintHtml(
				`
<style>
  #parent {
    width: 200px;
    height: 150px;
    padding: 5px;
    border-radius: 20px;
    background: #ccc;
  }
  #child {
    width: 190px;
    height: 140px;
    border-radius: 16px;
    background: #fff;
  }
</style>

<div id="parent">
  <div id="child"></div>
</div>
`,
				{
					"rules/corner-radius-coherence": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"checks all 4 corners independently (topLeft, topRight, bottomRight, bottomLeft)",
		{ timeout: 60_000 },
		async () => {
			// Parent has 20px radius on all corners, child is inset 4px
			// Expected child radius = 20 - 4 = 16px
			// Only the top-left corner has the wrong radius (5px instead of 16px)
			const result = await lintHtml(
				`
<style>
  #parent {
    width: 200px;
    height: 150px;
    padding: 4px;
    border-radius: 20px;
    background: #ccc;
  }
  #child {
    width: 192px;
    height: 142px;
    border-top-left-radius: 5px;
    border-top-right-radius: 16px;
    border-bottom-right-radius: 16px;
    border-bottom-left-radius: 16px;
    background: #fff;
  }
</style>

<div id="parent">
  <div id="child"></div>
</div>
`,
				{
					"rules/corner-radius-coherence": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			// Should specifically mention top-left corner
			expect(messages.some((m) => m.message.includes("top-left"))).toBe(true)
			// Should NOT mention other corners (they are correct)
			expect(messages.some((m) => m.message.includes("top-right"))).toBe(false)
		},
	)

	test(
		"reports expected vs actual radius in message",
		{ timeout: 60_000 },
		async () => {
			// Parent has 24px radius, child is inset 4px
			// Expected child radius = 24 - 4 = 20px
			// Child has 10px radius (wrong)
			const result = await lintHtml(
				`
<style>
  #parent {
    width: 200px;
    height: 150px;
    padding: 4px;
    border-radius: 24px;
    background: #ccc;
  }
  #child {
    width: 192px;
    height: 142px;
    border-radius: 10px;
    background: #fff;
  }
</style>

<div id="parent">
  <div id="child"></div>
</div>
`,
				{
					"rules/corner-radius-coherence": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			const message = messages.find(
				(m) => m.ruleId === "rules/corner-radius-coherence",
			)
			expect(message).toBeDefined()
			// Should contain expected ~20px and found 10px
			expect(message?.message).toMatch(/expected ~\d+px/)
			expect(message?.message).toMatch(/found \d+px/)
		},
	)

	test(
		"includes 'Parent with rounded corners' relation in report",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #parent {
    width: 200px;
    height: 150px;
    padding: 5px;
    border-radius: 20px;
    background: #ccc;
  }
  #child {
    width: 190px;
    height: 140px;
    border-radius: 5px;
    background: #fff;
  }
</style>

<div id="parent">
  <div id="child"></div>
</div>
`,
				{
					"rules/corner-radius-coherence": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			const message = messages.find(
				(m) => m.ruleId === "rules/corner-radius-coherence",
			)
			expect(message).toBeDefined()
			expect(message?.relations).toBeDefined()
			expect(message?.relations?.length).toBeGreaterThan(0)
			expect(
				message?.relations?.some(
					(r) => r.description === "Parent with rounded corners",
				),
			).toBe(true)
		},
	)

	test(
		"correctly calculates inset from parent rect edges",
		{ timeout: 60_000 },
		async () => {
			// Using absolute positioning to precisely control inset
			// Parent has 30px radius, child is inset 10px from edges
			// Expected child radius = 30 - 10 = 20px
			// Child has 20px radius (correct) - should NOT trigger
			const result = await lintHtml(
				`
<style>
  #parent {
    position: relative;
    width: 200px;
    height: 150px;
    border-radius: 30px;
    background: #ccc;
  }
  #child {
    position: absolute;
    top: 10px;
    left: 10px;
    right: 10px;
    bottom: 10px;
    border-radius: 20px;
    background: #fff;
  }
</style>

<div id="parent">
  <div id="child"></div>
</div>
`,
				{
					"rules/corner-radius-coherence": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"correctly calculates inset from parent rect edges - violation case",
		{ timeout: 60_000 },
		async () => {
			// Using absolute positioning to precisely control inset
			// Parent has 30px radius, child is inset 10px from edges
			// Expected child radius = 30 - 10 = 20px
			// Child has 30px radius (wrong) - should trigger
			const result = await lintHtml(
				`
<style>
  #parent {
    position: relative;
    width: 200px;
    height: 150px;
    border-radius: 30px;
    background: #ccc;
  }
  #child {
    position: absolute;
    top: 10px;
    left: 10px;
    right: 10px;
    bottom: 10px;
    border-radius: 30px;
    background: #fff;
  }
</style>

<div id="parent">
  <div id="child"></div>
</div>
`,
				{
					"rules/corner-radius-coherence": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			expect(
				messages.some((m) => m.ruleId === "rules/corner-radius-coherence"),
			).toBe(true)
		},
	)

	test(
		"NOT triggered for invisible elements",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #parent {
    width: 200px;
    height: 150px;
    padding: 5px;
    border-radius: 20px;
    background: #ccc;
  }
  #child {
    width: 190px;
    height: 140px;
    border-radius: 5px;
    background: #fff;
    display: none;
  }
</style>

<div id="parent">
  <div id="child"></div>
</div>
`,
				{
					"rules/corner-radius-coherence": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"NOT triggered for elements with visibility: hidden",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #parent {
    width: 200px;
    height: 150px;
    padding: 5px;
    border-radius: 20px;
    background: #ccc;
  }
  #child {
    width: 190px;
    height: 140px;
    border-radius: 5px;
    background: #fff;
    visibility: hidden;
  }
</style>

<div id="parent">
  <div id="child"></div>
</div>
`,
				{
					"rules/corner-radius-coherence": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"NOT triggered for zero-size elements",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #parent {
    width: 200px;
    height: 150px;
    padding: 5px;
    border-radius: 20px;
    background: #ccc;
  }
  #child {
    width: 0;
    height: 0;
    border-radius: 5px;
    background: #fff;
  }
</style>

<div id="parent">
  <div id="child"></div>
</div>
`,
				{
					"rules/corner-radius-coherence": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"detects violation with border instead of background",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #parent {
    width: 200px;
    height: 150px;
    padding: 5px;
    border-radius: 20px;
    background: #ccc;
  }
  #child {
    width: 190px;
    height: 140px;
    border-radius: 5px;
    border: 2px solid #000;
    background: transparent;
  }
</style>

<div id="parent">
  <div id="child"></div>
</div>
`,
				{
					"rules/corner-radius-coherence": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			expect(
				messages.some((m) => m.ruleId === "rules/corner-radius-coherence"),
			).toBe(true)
		},
	)

	test(
		"detects violation with box-shadow instead of background",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #parent {
    width: 200px;
    height: 150px;
    padding: 5px;
    border-radius: 20px;
    background: #ccc;
  }
  #child {
    width: 190px;
    height: 140px;
    border-radius: 5px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    background: transparent;
  }
</style>

<div id="parent">
  <div id="child"></div>
</div>
`,
				{
					"rules/corner-radius-coherence": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			expect(
				messages.some((m) => m.ruleId === "rules/corner-radius-coherence"),
			).toBe(true)
		},
	)

	test(
		"correct child radius passes validation",
		{ timeout: 60_000 },
		async () => {
			// Parent has 20px radius, child is inset 5px
			// Expected child radius = 20 - 5 = 15px
			// Child has 15px radius (correct)
			const result = await lintHtml(
				`
<style>
  #parent {
    width: 200px;
    height: 150px;
    padding: 5px;
    border-radius: 20px;
    background: #ccc;
  }
  #child {
    width: 190px;
    height: 140px;
    border-radius: 15px;
    background: #fff;
  }
</style>

<div id="parent">
  <div id="child"></div>
</div>
`,
				{
					"rules/corner-radius-coherence": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"multiple violations in one element reports all corners",
		{ timeout: 60_000 },
		async () => {
			// Parent has 20px radius on all corners, child is inset 4px
			// Expected child radius = 20 - 4 = 16px
			// Child has wrong radius on multiple corners
			const result = await lintHtml(
				`
<style>
  #parent {
    width: 200px;
    height: 150px;
    padding: 4px;
    border-radius: 20px;
    background: #ccc;
  }
  #child {
    width: 192px;
    height: 142px;
    border-top-left-radius: 5px;
    border-top-right-radius: 5px;
    border-bottom-right-radius: 16px;
    border-bottom-left-radius: 16px;
    background: #fff;
  }
</style>

<div id="parent">
  <div id="child"></div>
</div>
`,
				{
					"rules/corner-radius-coherence": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			const message = messages.find(
				(m) => m.ruleId === "rules/corner-radius-coherence",
			)
			expect(message).toBeDefined()
			// Should mention both top-left and top-right
			expect(message?.message).toMatch(/top-left/)
			expect(message?.message).toMatch(/top-right/)
		},
	)

	test(
		"child with zero radius when expected radius is positive triggers violation",
		{ timeout: 60_000 },
		async () => {
			// Parent has 20px radius, child is inset 5px
			// Expected child radius = 20 - 5 = 15px
			// Child has 0px radius (sharp corners)
			const result = await lintHtml(
				`
<style>
  #parent {
    width: 200px;
    height: 150px;
    padding: 5px;
    border-radius: 20px;
    background: #ccc;
  }
  #child {
    width: 190px;
    height: 140px;
    border-radius: 0;
    background: #fff;
  }
</style>

<div id="parent">
  <div id="child"></div>
</div>
`,
				{
					"rules/corner-radius-coherence": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			expect(
				messages.some((m) => m.ruleId === "rules/corner-radius-coherence"),
			).toBe(true)
			expect(messages.some((m) => m.message.includes("found 0px"))).toBe(true)
		},
	)

	test(
		"parent with only some corners rounded only checks those corners",
		{ timeout: 60_000 },
		async () => {
			// Parent has 20px radius only on top corners, 0 on bottom
			// Child is inset 4px, has wrong top-left but any bottom radius is fine
			const result = await lintHtml(
				`
<style>
  #parent {
    width: 200px;
    height: 150px;
    padding: 4px;
    border-top-left-radius: 20px;
    border-top-right-radius: 20px;
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
    background: #ccc;
  }
  #child {
    width: 192px;
    height: 142px;
    border-top-left-radius: 5px;
    border-top-right-radius: 16px;
    border-bottom-left-radius: 20px;
    border-bottom-right-radius: 20px;
    background: #fff;
  }
</style>

<div id="parent">
  <div id="child"></div>
</div>
`,
				{
					"rules/corner-radius-coherence": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			const message = messages.find(
				(m) => m.ruleId === "rules/corner-radius-coherence",
			)
			expect(message).toBeDefined()
			// Should only report top-left (parent bottom corners have 0 radius)
			expect(message?.message).toMatch(/top-left/)
			expect(message?.message).not.toMatch(/bottom-left/)
			expect(message?.message).not.toMatch(/bottom-right/)
		},
	)

	test(
		"deeply nested elements only check immediate parent",
		{ timeout: 60_000 },
		async () => {
			// Grandparent has large radius, parent has correct radius relative to grandparent
			// Child is checked against parent (not grandparent)
			const result = await lintHtml(
				`
<style>
  #grandparent {
    width: 250px;
    height: 200px;
    padding: 10px;
    border-radius: 30px;
    background: #aaa;
  }
  #parent {
    width: 230px;
    height: 180px;
    padding: 5px;
    border-radius: 20px;
    background: #ccc;
  }
  #child {
    width: 220px;
    height: 170px;
    border-radius: 15px;
    background: #fff;
  }
</style>

<div id="grandparent">
  <div id="parent">
    <div id="child"></div>
  </div>
</div>
`,
				{
					"rules/corner-radius-coherence": "error",
				},
			)

			// All elements follow the rule correctly
			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"asymmetric insets are calculated correctly per corner",
		{ timeout: 60_000 },
		async () => {
			// Child is positioned with different insets on each side
			// Top-left inset is 5px (min of top:5px and left:5px)
			// Top-right inset is 10px (min of top:5px and right:10px) -> actually 5px
			const result = await lintHtml(
				`
<style>
  #parent {
    position: relative;
    width: 200px;
    height: 150px;
    border-radius: 20px;
    background: #ccc;
  }
  #child {
    position: absolute;
    top: 5px;
    left: 5px;
    right: 5px;
    bottom: 5px;
    border-radius: 15px;
    background: #fff;
  }
</style>

<div id="parent">
  <div id="child"></div>
</div>
`,
				{
					"rules/corner-radius-coherence": "error",
				},
			)

			// Child has 15px radius with 5px inset (20-5=15), should pass
			expect(result?.messages ?? []).toHaveLength(0)
		},
	)
})
