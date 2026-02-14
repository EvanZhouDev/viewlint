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

describe("@viewlint/rules misalignment", () => {
	test(
		"basic misalignment detection - flex children with slightly off alignment",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    display: flex;
    flex-direction: row;
    gap: 20px;
    padding: 20px;
  }
  #box1 {
    width: 100px;
    height: 50px;
    background: #ccc;
    margin-top: 0;
  }
  #box2 {
    width: 100px;
    height: 50px;
    background: #ddd;
    margin-top: 4px; /* 4px off - in mistake range */
  }
</style>

<div id="container">
  <div id="box1">Box 1</div>
  <div id="box2">Box 2</div>
</div>
`,
				{
					"rules/misalignment": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			expect(messages.some((m) => m.ruleId === "rules/misalignment")).toBe(true)
		},
	)

	test(
		"only checks flex container children - non-flex containers are ignored",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    display: block; /* Not a flex container */
    padding: 20px;
  }
  #box1 {
    width: 100px;
    height: 50px;
    background: #ccc;
    margin-left: 0;
  }
  #box2 {
    width: 100px;
    height: 50px;
    background: #ddd;
    margin-left: 4px; /* Would be misaligned if this was flex */
  }
</style>

<div id="container">
  <div id="box1">Box 1</div>
  <div id="box2">Box 2</div>
</div>
`,
				{
					"rules/misalignment": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"NOT triggered for perfectly aligned elements (offset <= 1px)",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    display: flex;
    flex-direction: row;
    align-items: flex-start;
    gap: 20px;
    padding: 20px;
  }
  #box1 {
    width: 100px;
    height: 50px;
    background: #ccc;
  }
  #box2 {
    width: 100px;
    height: 60px;
    background: #ddd;
  }
</style>

<div id="container">
  <div id="box1">Box 1</div>
  <div id="box2">Box 2</div>
</div>
`,
				{
					"rules/misalignment": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"NOT triggered for perfectly aligned elements with 1px variance",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    display: flex;
    flex-direction: row;
    gap: 20px;
    padding: 20px;
  }
  #box1 {
    width: 100px;
    height: 50px;
    background: #ccc;
  }
  #box2 {
    width: 100px;
    height: 50px;
    background: #ddd;
    margin-top: 1px; /* 1px is within perfect threshold */
  }
</style>

<div id="container">
  <div id="box1">Box 1</div>
  <div id="box2">Box 2</div>
</div>
`,
				{
					"rules/misalignment": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"only triggered when offset is in mistake range (2-6px) - 2px triggers",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    display: flex;
    flex-direction: row;
    gap: 20px;
    padding: 20px;
  }
  #box1 {
    width: 100px;
    height: 50px;
    background: #ccc;
  }
  #box2 {
    width: 100px;
    height: 50px;
    background: #ddd;
    margin-top: 2px; /* Minimum mistake range */
  }
</style>

<div id="container">
  <div id="box1">Box 1</div>
  <div id="box2">Box 2</div>
</div>
`,
				{
					"rules/misalignment": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			expect(messages.some((m) => m.ruleId === "rules/misalignment")).toBe(true)
		},
	)

	test(
		"only triggered when offset is in mistake range (2-6px) - 6px triggers",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    display: flex;
    flex-direction: row;
    gap: 20px;
    padding: 20px;
  }
  #box1 {
    width: 100px;
    height: 50px;
    background: #ccc;
  }
  #box2 {
    width: 100px;
    height: 50px;
    background: #ddd;
    margin-top: 6px; /* Maximum mistake range */
  }
</style>

<div id="container">
  <div id="box1">Box 1</div>
  <div id="box2">Box 2</div>
</div>
`,
				{
					"rules/misalignment": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			expect(messages.some((m) => m.ruleId === "rules/misalignment")).toBe(true)
		},
	)

	test(
		"NOT triggered when offset exceeds mistake range (> 6px)",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    display: flex;
    flex-direction: row;
    gap: 20px;
    padding: 20px;
  }
  #box1 {
    width: 100px;
    height: 50px;
    background: #ccc;
  }
  #box2 {
    width: 100px;
    height: 50px;
    background: #ddd;
    margin-top: 10px; /* Intentional offset - not a mistake */
  }
</style>

<div id="container">
  <div id="box1">Box 1</div>
  <div id="box2">Box 2</div>
</div>
`,
				{
					"rules/misalignment": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"for row layouts: checks top alignment",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    display: flex;
    flex-direction: row;
    gap: 20px;
    padding: 20px;
  }
  #box1 {
    width: 100px;
    height: 50px;
    background: #ccc;
  }
  #box2 {
    width: 100px;
    height: 50px;
    background: #ddd;
    margin-top: 3px; /* Top edges differ by 3px */
  }
</style>

<div id="container">
  <div id="box1">Box 1</div>
  <div id="box2">Box 2</div>
</div>
`,
				{
					"rules/misalignment": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			const misalignmentMsg = messages.find(
				(m) => m.ruleId === "rules/misalignment",
			)
			expect(misalignmentMsg).toBeDefined()
			expect(misalignmentMsg?.message).toContain("top")
		},
	)

	test(
		"for row layouts: checks bottom alignment",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    display: flex;
    flex-direction: row;
    gap: 20px;
    padding: 20px;
  }
  #box1 {
    width: 100px;
    height: 60px;
    background: #ccc;
  }
  #box2 {
    width: 100px;
    height: 50px; /* Different height */
    background: #ddd;
    /* 
     * box1: top=20, bottom=80
     * box2 without margin: top=20, bottom=70
     * With margin-top: 14px: top=34, bottom=84
     * Now: top diff = 14 (too large)
     *      bottom diff = 4 (in range!)
     *      center-y: (20+80)/2=50 vs (34+84)/2=59, diff=9 (too large)
     */
    margin-top: 14px;
  }
</style>

<div id="container">
  <div id="box1">Box 1</div>
  <div id="box2">Box 2</div>
</div>
`,
				{
					"rules/misalignment": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			const misalignmentMsg = messages.find(
				(m) => m.ruleId === "rules/misalignment",
			)
			expect(misalignmentMsg).toBeDefined()
			expect(misalignmentMsg?.message).toContain("bottom")
		},
	)

	test(
		"for row layouts: checks center-y alignment",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 20px;
    padding: 20px;
    height: 120px;
  }
  #box1 {
    width: 100px;
    height: 50px;
    background: #ccc;
  }
  #box2 {
    width: 100px;
    height: 40px;
    background: #ddd;
    /* Different heights but almost vertically centered */
    /* Move box2 slightly to create center-y misalignment */
    position: relative;
    top: 3px;
  }
</style>

<div id="container">
  <div id="box1">Box 1</div>
  <div id="box2">Box 2</div>
</div>
`,
				{
					"rules/misalignment": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			expect(messages.some((m) => m.ruleId === "rules/misalignment")).toBe(true)
		},
	)

	test(
		"for column layouts: checks left alignment",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding: 20px;
  }
  #box1 {
    width: 100px;
    height: 50px;
    background: #ccc;
  }
  #box2 {
    width: 100px;
    height: 50px;
    background: #ddd;
    margin-left: 4px; /* Left edges differ by 4px */
  }
</style>

<div id="container">
  <div id="box1">Box 1</div>
  <div id="box2">Box 2</div>
</div>
`,
				{
					"rules/misalignment": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			const misalignmentMsg = messages.find(
				(m) => m.ruleId === "rules/misalignment",
			)
			expect(misalignmentMsg).toBeDefined()
			expect(misalignmentMsg?.message).toContain("left")
		},
	)

	test(
		"for column layouts: checks right alignment",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 20px;
    padding: 20px;
    width: 300px;
  }
  #box1 {
    width: 100px;
    height: 50px;
    background: #ccc;
  }
  #box2 {
    width: 80px; /* Different width so left edges are naturally different */
    height: 50px;
    background: #ddd;
    margin-right: 5px; /* Right edges differ by 5px */
  }
</style>

<div id="container">
  <div id="box1">Box 1</div>
  <div id="box2">Box 2</div>
</div>
`,
				{
					"rules/misalignment": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			const misalignmentMsg = messages.find(
				(m) => m.ruleId === "rules/misalignment",
			)
			expect(misalignmentMsg).toBeDefined()
			expect(misalignmentMsg?.message).toContain("right")
		},
	)

	test(
		"for column layouts: checks center-x alignment",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
    padding: 20px;
    width: 300px;
  }
  #box1 {
    width: 100px;
    height: 50px;
    background: #ccc;
  }
  #box2 {
    width: 80px;
    height: 50px;
    background: #ddd;
    /* Different widths, almost horizontally centered */
    /* Move slightly to create center-x misalignment */
    position: relative;
    left: 3px;
  }
</style>

<div id="container">
  <div id="box1">Box 1</div>
  <div id="box2">Box 2</div>
</div>
`,
				{
					"rules/misalignment": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			expect(messages.some((m) => m.ruleId === "rules/misalignment")).toBe(true)
		},
	)

	test(
		"NOT triggered when any edge is perfectly aligned",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    display: flex;
    flex-direction: row;
    align-items: flex-start;
    gap: 20px;
    padding: 20px;
  }
  #box1 {
    width: 100px;
    height: 50px;
    background: #ccc;
  }
  #box2 {
    width: 100px;
    height: 60px; /* Different height but top-aligned perfectly */
    background: #ddd;
  }
</style>

<div id="container">
  <div id="box1">Box 1</div>
  <div id="box2">Box 2</div>
</div>
`,
				{
					"rules/misalignment": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"NOT triggered for elements smaller than 24px",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    display: flex;
    flex-direction: row;
    gap: 10px;
    padding: 20px;
  }
  #box1 {
    width: 20px; /* Less than 24px */
    height: 20px;
    background: #ccc;
  }
  #box2 {
    width: 20px;
    height: 20px;
    background: #ddd;
    margin-top: 4px; /* Would be in mistake range if element was larger */
  }
</style>

<div id="container">
  <div id="box1">1</div>
  <div id="box2">2</div>
</div>
`,
				{
					"rules/misalignment": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"reports correct edge name and offset amount in message",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    display: flex;
    flex-direction: row;
    gap: 20px;
    padding: 20px;
  }
  #box1 {
    width: 100px;
    height: 50px;
    background: #ccc;
  }
  #box2 {
    width: 100px;
    height: 50px;
    background: #ddd;
    margin-top: 5px; /* 5px offset */
  }
</style>

<div id="container">
  <div id="box1">Box 1</div>
  <div id="box2">Box 2</div>
</div>
`,
				{
					"rules/misalignment": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			const misalignmentMsg = messages.find(
				(m) => m.ruleId === "rules/misalignment",
			)
			expect(misalignmentMsg).toBeDefined()
			expect(misalignmentMsg?.message).toContain("top")
			expect(misalignmentMsg?.message).toContain("5px")
		},
	)

	test(
		'includes "Misaligned sibling" relation in report',
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    display: flex;
    flex-direction: row;
    gap: 20px;
    padding: 20px;
  }
  #box1 {
    width: 100px;
    height: 50px;
    background: #ccc;
  }
  #box2 {
    width: 100px;
    height: 50px;
    background: #ddd;
    margin-top: 3px;
  }
</style>

<div id="container">
  <div id="box1">Box 1</div>
  <div id="box2">Box 2</div>
</div>
`,
				{
					"rules/misalignment": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			const misalignmentMsg = messages.find(
				(m) => m.ruleId === "rules/misalignment",
			)
			expect(misalignmentMsg).toBeDefined()
			expect(misalignmentMsg?.relations).toBeDefined()
			expect(misalignmentMsg?.relations?.length).toBeGreaterThan(0)
			expect(
				misalignmentMsg?.relations?.some(
					(r) => r.description === "Misaligned sibling",
				),
			).toBe(true)
		},
	)

	test("works with inline-flex containers", { timeout: 60_000 }, async () => {
		const result = await lintHtml(
			`
<style>
  #container {
    display: inline-flex;
    flex-direction: row;
    gap: 20px;
    padding: 20px;
  }
  #box1 {
    width: 100px;
    height: 50px;
    background: #ccc;
  }
  #box2 {
    width: 100px;
    height: 50px;
    background: #ddd;
    margin-top: 4px;
  }
</style>

<div id="container">
  <div id="box1">Box 1</div>
  <div id="box2">Box 2</div>
</div>
`,
			{
				"rules/misalignment": "error",
			},
		)

		const messages = result?.messages ?? []
		expect(messages.length).toBeGreaterThan(0)
		expect(messages.some((m) => m.ruleId === "rules/misalignment")).toBe(true)
	})

	test(
		"handles column-reverse flex direction",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    display: flex;
    flex-direction: column-reverse;
    gap: 20px;
    padding: 20px;
  }
  #box1 {
    width: 100px;
    height: 50px;
    background: #ccc;
  }
  #box2 {
    width: 100px;
    height: 50px;
    background: #ddd;
    margin-left: 3px; /* Left edges differ */
  }
</style>

<div id="container">
  <div id="box1">Box 1</div>
  <div id="box2">Box 2</div>
</div>
`,
				{
					"rules/misalignment": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			const misalignmentMsg = messages.find(
				(m) => m.ruleId === "rules/misalignment",
			)
			expect(misalignmentMsg).toBeDefined()
			expect(misalignmentMsg?.message).toContain("left")
		},
	)

	test("handles row-reverse flex direction", { timeout: 60_000 }, async () => {
		const result = await lintHtml(
			`
<style>
  #container {
    display: flex;
    flex-direction: row-reverse;
    gap: 20px;
    padding: 20px;
  }
  #box1 {
    width: 100px;
    height: 50px;
    background: #ccc;
  }
  #box2 {
    width: 100px;
    height: 50px;
    background: #ddd;
    margin-top: 4px; /* Top edges differ */
  }
</style>

<div id="container">
  <div id="box1">Box 1</div>
  <div id="box2">Box 2</div>
</div>
`,
			{
				"rules/misalignment": "error",
			},
		)

		const messages = result?.messages ?? []
		expect(messages.length).toBeGreaterThan(0)
		const misalignmentMsg = messages.find(
			(m) => m.ruleId === "rules/misalignment",
		)
		expect(misalignmentMsg).toBeDefined()
		expect(misalignmentMsg?.message).toContain("top")
	})

	test("does not report same pair twice", { timeout: 60_000 }, async () => {
		const result = await lintHtml(
			`
<style>
  #container {
    display: flex;
    flex-direction: row;
    gap: 20px;
    padding: 20px;
  }
  #box1 {
    width: 100px;
    height: 50px;
    background: #ccc;
  }
  #box2 {
    width: 100px;
    height: 50px;
    background: #ddd;
    margin-top: 4px;
  }
</style>

<div id="container">
  <div id="box1">Box 1</div>
  <div id="box2">Box 2</div>
</div>
`,
			{
				"rules/misalignment": "error",
			},
		)

		const messages = result?.messages ?? []
		const misalignmentMessages = messages.filter(
			(m) => m.ruleId === "rules/misalignment",
		)
		// Should only report once, not twice (once for each element in the pair)
		expect(misalignmentMessages.length).toBe(1)
	})

	test("ignores hidden elements", { timeout: 60_000 }, async () => {
		const result = await lintHtml(
			`
<style>
  #container {
    display: flex;
    flex-direction: row;
    gap: 20px;
    padding: 20px;
  }
  #box1 {
    width: 100px;
    height: 50px;
    background: #ccc;
  }
  #box2 {
    width: 100px;
    height: 50px;
    background: #ddd;
    margin-top: 4px;
    visibility: hidden; /* Hidden element */
  }
</style>

<div id="container">
  <div id="box1">Box 1</div>
  <div id="box2">Box 2</div>
</div>
`,
			{
				"rules/misalignment": "error",
			},
		)

		expect(result?.messages ?? []).toHaveLength(0)
	})

	test(
		"multiple siblings with misalignment reports each pair once",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    display: flex;
    flex-direction: row;
    gap: 20px;
    padding: 20px;
  }
  .box {
    width: 50px;
    height: 50px;
    background: #ccc;
  }
  #box1 { margin-top: 0; }
  #box2 { margin-top: 3px; }
  #box3 { margin-top: 0; }
</style>

<div id="container">
  <div id="box1" class="box">1</div>
  <div id="box2" class="box">2</div>
  <div id="box3" class="box">3</div>
</div>
`,
				{
					"rules/misalignment": "error",
				},
			)

			const messages = result?.messages ?? []
			const misalignmentMessages = messages.filter(
				(m) => m.ruleId === "rules/misalignment",
			)
			// box2 is misaligned with both box1 and box3
			expect(misalignmentMessages.length).toBeGreaterThanOrEqual(1)
		},
	)
})
