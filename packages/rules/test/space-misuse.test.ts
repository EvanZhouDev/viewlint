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

describe("@viewlint/rules space-misuse", () => {
	// 1. Asymmetric spacing detection - large gap on one side, small on other
	test(
		"detects asymmetric horizontal spacing (content flush left, large gap right)",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  body { margin: 0; padding: 0; }
  #container {
    width: 300px;
    height: 100px;
    border: 1px solid #000;
  }
  #content {
    width: 100px;
    height: 80px;
    background: #ccc;
  }
</style>

<div id="container">
  <div id="content">Content</div>
</div>
`,
				{
					"rules/space-misuse": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			expect(messages.some((m) => m.ruleId === "rules/space-misuse")).toBe(true)
			expect(
				messages.some(
					(m) =>
						m.message.includes("left") ||
						m.message.includes("right") ||
						m.message.includes("flush"),
				),
			).toBe(true)
		},
	)

	test(
		"detects asymmetric vertical spacing (content at top, large gap bottom)",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  body { margin: 0; padding: 0; }
  #container {
    width: 200px;
    height: 300px;
    border: 1px solid #000;
  }
  #content {
    width: 180px;
    height: 100px;
    background: #ccc;
  }
</style>

<div id="container">
  <div id="content">Content</div>
</div>
`,
				{
					"rules/space-misuse": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			expect(messages.some((m) => m.ruleId === "rules/space-misuse")).toBe(true)
			expect(
				messages.some(
					(m) =>
						m.message.includes("top") ||
						m.message.includes("bottom") ||
						m.message.includes("flush"),
				),
			).toBe(true)
		},
	)

	// 2. Excessive padding detection - content fills <25% of container
	test(
		"detects excessive horizontal padding when content fills less than 25%",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  body { margin: 0; padding: 0; }
  #container {
    width: 500px;
    height: 100px;
    border: 1px solid #000;
    display: flex;
    justify-content: center;
    align-items: center;
  }
  #content {
    width: 80px;
    height: 80px;
    background: #ccc;
  }
</style>

<div id="container">
  <div id="content">Small</div>
</div>
`,
				{
					"rules/space-misuse": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			expect(messages.some((m) => m.ruleId === "rules/space-misuse")).toBe(true)
			expect(
				messages.some(
					(m) =>
						m.message.includes("fills only") &&
						m.message.includes("horizontal"),
				),
			).toBe(true)
		},
	)

	test(
		"detects excessive vertical padding when content fills less than 25%",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  body { margin: 0; padding: 0; }
  #container {
    width: 100px;
    height: 500px;
    border: 1px solid #000;
    display: flex;
    justify-content: center;
    align-items: center;
  }
  #content {
    width: 80px;
    height: 80px;
    background: #ccc;
  }
</style>

<div id="container">
  <div id="content">Small</div>
</div>
`,
				{
					"rules/space-misuse": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			expect(messages.some((m) => m.ruleId === "rules/space-misuse")).toBe(true)
			expect(
				messages.some(
					(m) =>
						m.message.includes("fills only") && m.message.includes("vertical"),
				),
			).toBe(true)
		},
	)

	// 3. NOT triggered for grid layouts
	test(
		"does not trigger for grid layout containers",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  html, body { margin: 0; padding: 0; height: 100%; }
  body {
    display: grid;
    place-items: start;
  }
  #container {
    display: grid;
    grid-template-columns: 1fr;
    width: 300px;
    height: 200px;
    border: 1px solid #000;
  }
  #content {
    width: 100px;
    height: 50px;
    background: #ccc;
  }
</style>

<div id="container">
  <div id="content">Grid item</div>
</div>
`,
				{
					"rules/space-misuse": "error",
				},
			)

			// Filter to only check for issues reported on #container
			const containerMessages = (result?.messages ?? []).filter(
				(m) =>
					m.ruleId === "rules/space-misuse" &&
					m.location.element.id === "container",
			)
			expect(containerMessages).toHaveLength(0)
		},
	)

	// 4. NOT triggered when content is <20% in both dimensions (likely intentional icon/badge)
	test(
		"does not trigger when content is small in both dimensions (icon/badge pattern)",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  html, body { margin: 0; padding: 0; height: 100%; }
  body {
    display: grid;
    place-items: start;
  }
  #container {
    width: 300px;
    height: 300px;
    border: 1px solid #000;
    position: relative;
  }
  #icon {
    position: absolute;
    top: 10px;
    right: 10px;
    width: 24px;
    height: 24px;
    background: #f00;
    border-radius: 50%;
  }
</style>

<div id="container">
  <div id="icon"></div>
</div>
`,
				{
					"rules/space-misuse": "error",
				},
			)

			// Filter to only check for issues reported on #container
			const containerMessages = (result?.messages ?? []).filter(
				(m) =>
					m.ruleId === "rules/space-misuse" &&
					m.location.element.id === "container",
			)
			expect(containerMessages).toHaveLength(0)
		},
	)

	// 5. NOT triggered when sibling fills the gap region
	test(
		"does not trigger when sibling element fills the gap region (horizontal)",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  html, body { margin: 0; padding: 0; height: 100%; }
  body {
    display: grid;
    place-items: start;
  }
  #wrapper {
    display: flex;
    width: 400px;
  }
  #sidebar {
    width: 100px;
    height: 100px;
    background: #ddd;
  }
  #container {
    width: 300px;
    height: 100px;
    border: 1px solid #000;
    display: flex;
    justify-content: flex-end;
  }
  #content {
    width: 100px;
    height: 80px;
    background: #ccc;
  }
</style>

<div id="wrapper">
  <div id="sidebar">Sidebar</div>
  <div id="container">
    <div id="content">Content</div>
  </div>
</div>
`,
				{
					"rules/space-misuse": "error",
				},
			)

			// Filter to only check for issues reported on #container
			const containerMessages = (result?.messages ?? []).filter(
				(m) =>
					m.ruleId === "rules/space-misuse" &&
					m.location.element.id === "container",
			)
			expect(containerMessages).toHaveLength(0)
		},
	)

	test(
		"does not trigger when sibling element fills the gap region (vertical)",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  html, body { margin: 0; padding: 0; height: 100%; }
  body {
    display: grid;
    place-items: start;
  }
  #wrapper {
    display: flex;
    flex-direction: column;
    width: 200px;
  }
  #header {
    width: 200px;
    height: 50px;
    background: #ddd;
  }
  #container {
    width: 200px;
    height: 200px;
    border: 1px solid #000;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
  }
  #content {
    width: 180px;
    height: 80px;
    background: #ccc;
  }
</style>

<div id="wrapper">
  <div id="header">Header</div>
  <div id="container">
    <div id="content">Content</div>
  </div>
</div>
`,
				{
					"rules/space-misuse": "error",
				},
			)

			// Filter to only check for issues reported on #container
			const containerMessages = (result?.messages ?? []).filter(
				(m) =>
					m.ruleId === "rules/space-misuse" &&
					m.location.element.id === "container",
			)
			expect(containerMessages).toHaveLength(0)
		},
	)

	// 6. NOT triggered when gaps are balanced (ratio < 6x)
	test(
		"does not trigger when gap ratio is less than 6x",
		{ timeout: 60_000 },
		async () => {
			// Gap ratio of 4:1 (40px vs 10px) should NOT trigger (less than 6x)
			const result = await lintHtml(
				`
<style>
  html, body { margin: 0; padding: 0; height: 100%; }
  body {
    display: grid;
    place-items: start;
  }
  #container {
    width: 200px;
    height: 100px;
    border: 1px solid #000;
  }
  #content {
    width: 150px;
    height: 80px;
    background: #ccc;
    margin-left: 10px;
    margin-top: 10px;
  }
</style>

<div id="container">
  <div id="content">Content</div>
</div>
`,
				{
					"rules/space-misuse": "error",
				},
			)

			// Filter to only check for issues reported on #container
			const containerMessages = (result?.messages ?? []).filter(
				(m) =>
					m.ruleId === "rules/space-misuse" &&
					m.location.element.id === "container",
			)
			expect(containerMessages).toHaveLength(0)
		},
	)

	// 7. Minimum gap difference of 40px required
	test(
		"does not trigger when gap difference is less than 40px",
		{ timeout: 60_000 },
		async () => {
			// Container 200px, content 140px = 60px total horizontal gap
			// Left margin 20px means right gap is 40px
			// Difference is only 20px (40-20), which is less than 40px threshold
			const result = await lintHtml(
				`
<style>
  html, body { margin: 0; padding: 0; height: 100%; }
  body {
    display: grid;
    place-items: start;
  }
  #container {
    width: 200px;
    height: 80px;
    border: 1px solid #000;
  }
  #content {
    width: 140px;
    height: 60px;
    background: #ccc;
    margin-left: 20px;
    margin-top: 10px;
  }
</style>

<div id="container">
  <div id="content">Content</div>
</div>
`,
				{
					"rules/space-misuse": "error",
				},
			)

			// Filter to only check for issues reported on #container
			const containerMessages = (result?.messages ?? []).filter(
				(m) =>
					m.ruleId === "rules/space-misuse" &&
					m.location.element.id === "container",
			)
			expect(containerMessages).toHaveLength(0)
		},
	)

	// 8. Minimum large gap of 60px required
	test(
		"does not trigger when largest gap is less than 60px",
		{ timeout: 60_000 },
		async () => {
			// Container 150px, content 100px = 50px horizontal gap (largest is 50px < 60px)
			const result = await lintHtml(
				`
<style>
  html, body { margin: 0; padding: 0; height: 100%; }
  body {
    display: grid;
    place-items: start;
  }
  #container {
    width: 150px;
    height: 80px;
    border: 1px solid #000;
  }
  #content {
    width: 100px;
    height: 60px;
    background: #ccc;
  }
</style>

<div id="container">
  <div id="content">Content</div>
</div>
`,
				{
					"rules/space-misuse": "error",
				},
			)

			// Filter to only check for issues reported on #container
			const containerMessages = (result?.messages ?? []).filter(
				(m) =>
					m.ruleId === "rules/space-misuse" &&
					m.location.element.id === "container",
			)
			expect(containerMessages).toHaveLength(0)
		},
	)

	// 9. Reports direction and gap amounts in message
	test(
		"reports specific direction and gap amounts in error message",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  body { margin: 0; padding: 0; }
  #container {
    width: 300px;
    height: 100px;
    border: 1px solid #000;
  }
  #content {
    width: 100px;
    height: 80px;
    background: #ccc;
  }
</style>

<div id="container">
  <div id="content">Content</div>
</div>
`,
				{
					"rules/space-misuse": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)

			const spaceMisuseMessage = messages.find(
				(m) => m.ruleId === "rules/space-misuse",
			)
			expect(spaceMisuseMessage).toBeDefined()
			// Message should contain px values
			expect(spaceMisuseMessage?.message).toMatch(/\d+px/)
		},
	)

	// 10. Only checks "leaf-like" containers (<=3 children or dominant child)
	test(
		"does not trigger for containers with many children (not leaf-like)",
		{ timeout: 60_000 },
		async () => {
			// 5 children each with 60*40=2400px area, total 12000px
			// Container is 400*200=80000px, so total area ratio is 15%
			// But there's no dominant child (max is 3%), so not leaf-like with >3 children
			const result = await lintHtml(
				`
<style>
  html, body { margin: 0; padding: 0; height: 100%; }
  body {
    display: grid;
    place-items: start;
  }
  #container {
    width: 400px;
    height: 200px;
    border: 1px solid #000;
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    align-content: flex-start;
  }
  .item {
    width: 60px;
    height: 40px;
    background: #ccc;
  }
</style>

<div id="container">
  <div class="item">1</div>
  <div class="item">2</div>
  <div class="item">3</div>
  <div class="item">4</div>
  <div class="item">5</div>
</div>
`,
				{
					"rules/space-misuse": "error",
				},
			)

			// Filter to only check for issues reported on #container
			const containerMessages = (result?.messages ?? []).filter(
				(m) =>
					m.ruleId === "rules/space-misuse" &&
					m.location.element.id === "container",
			)
			expect(containerMessages).toHaveLength(0)
		},
	)

	test(
		"triggers for container with dominant child even if other children exist",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  body { margin: 0; padding: 0; }
  #container {
    width: 400px;
    height: 200px;
    border: 1px solid #000;
    position: relative;
  }
  #dominant {
    width: 100px;
    height: 180px;
    background: #ccc;
  }
  .tiny {
    position: absolute;
    width: 10px;
    height: 10px;
    background: #f00;
  }
  .tiny:nth-child(2) { top: 5px; right: 5px; }
  .tiny:nth-child(3) { bottom: 5px; right: 5px; }
  .tiny:nth-child(4) { top: 50px; right: 5px; }
  .tiny:nth-child(5) { top: 80px; right: 5px; }
</style>

<div id="container">
  <div id="dominant">Main content</div>
  <div class="tiny"></div>
  <div class="tiny"></div>
  <div class="tiny"></div>
  <div class="tiny"></div>
</div>
`,
				{
					"rules/space-misuse": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			expect(messages.some((m) => m.ruleId === "rules/space-misuse")).toBe(true)
		},
	)

	// 11. Minimum container size of 50px
	test(
		"does not trigger for containers smaller than 50px",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  html, body { margin: 0; padding: 0; height: 100%; }
  body {
    display: grid;
    place-items: start;
  }
  #container {
    width: 40px;
    height: 40px;
    border: 1px solid #000;
  }
  #content {
    width: 10px;
    height: 10px;
    background: #ccc;
  }
</style>

<div id="container">
  <div id="content"></div>
</div>
`,
				{
					"rules/space-misuse": "error",
				},
			)

			// Filter to only check for issues reported on #container
			const containerMessages = (result?.messages ?? []).filter(
				(m) =>
					m.ruleId === "rules/space-misuse" &&
					m.location.element.id === "container",
			)
			expect(containerMessages).toHaveLength(0)
		},
	)

	// 12. NOT triggered for invisible elements
	test(
		"does not trigger for invisible containers",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  html, body { margin: 0; padding: 0; height: 100%; }
  body {
    display: grid;
    place-items: start;
  }
  #container {
    width: 300px;
    height: 200px;
    border: 1px solid #000;
    display: none;
  }
  #content {
    width: 100px;
    height: 50px;
    background: #ccc;
  }
</style>

<div id="container">
  <div id="content">Content</div>
</div>
`,
				{
					"rules/space-misuse": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"does not trigger for containers with visibility: hidden",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  html, body { margin: 0; padding: 0; height: 100%; }
  body {
    display: grid;
    place-items: start;
  }
  #container {
    width: 300px;
    height: 200px;
    border: 1px solid #000;
    visibility: hidden;
  }
  #content {
    width: 100px;
    height: 50px;
    background: #ccc;
  }
</style>

<div id="container">
  <div id="content">Content</div>
</div>
`,
				{
					"rules/space-misuse": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"does not trigger for zero-opacity containers",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  html, body { margin: 0; padding: 0; height: 100%; }
  body {
    display: grid;
    place-items: start;
  }
  #container {
    width: 300px;
    height: 200px;
    border: 1px solid #000;
    opacity: 0;
  }
  #content {
    width: 100px;
    height: 50px;
    background: #ccc;
  }
</style>

<div id="container">
  <div id="content">Content</div>
</div>
`,
				{
					"rules/space-misuse": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	// Additional edge cases
	test(
		"does not trigger when content properly centered with balanced gaps",
		{ timeout: 60_000 },
		async () => {
			// Content 150px in 200px container = 25px on each side (balanced)
			// Content 70px in 100px container = 15px on each side (balanced)
			const result = await lintHtml(
				`
<style>
  html, body { margin: 0; padding: 0; height: 100%; }
  body {
    display: grid;
    place-items: start;
  }
  #container {
    width: 200px;
    height: 100px;
    border: 1px solid #000;
    display: flex;
    justify-content: center;
    align-items: center;
  }
  #content {
    width: 150px;
    height: 70px;
    background: #ccc;
  }
</style>

<div id="container">
  <div id="content">Centered</div>
</div>
`,
				{
					"rules/space-misuse": "error",
				},
			)

			// Filter to only check for issues reported on #container
			const containerMessages = (result?.messages ?? []).filter(
				(m) =>
					m.ruleId === "rules/space-misuse" &&
					m.location.element.id === "container",
			)
			expect(containerMessages).toHaveLength(0)
		},
	)

	test(
		"handles containers with 2-3 children (still leaf-like when area ratio is low)",
		{ timeout: 60_000 },
		async () => {
			// 3 children with total area of 3*30*20=1800px in 400*200=80000px container
			// Total area ratio = 2.25% which is < 30%, so it's leaf-like
			const result = await lintHtml(
				`
<style>
  body { margin: 0; padding: 0; }
  #container {
    width: 400px;
    height: 200px;
    border: 1px solid #000;
  }
  .child {
    width: 30px;
    height: 20px;
    background: #ccc;
    display: inline-block;
  }
</style>

<div id="container">
  <div class="child">1</div>
  <div class="child">2</div>
  <div class="child">3</div>
</div>
`,
				{
					"rules/space-misuse": "error",
				},
			)

			const messages = result?.messages ?? []
			// Should trigger because 3 small children in a large container
			// with low total area ratio and asymmetric spacing
			expect(messages.length).toBeGreaterThan(0)
			expect(messages.some((m) => m.ruleId === "rules/space-misuse")).toBe(true)
		},
	)

	test(
		"detects content pushed to one corner with large gaps on opposite sides",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  body { margin: 0; padding: 0; }
  #container {
    width: 300px;
    height: 250px;
    border: 1px solid #000;
  }
  #content {
    width: 100px;
    height: 80px;
    background: #ccc;
  }
</style>

<div id="container">
  <div id="content">Corner</div>
</div>
`,
				{
					"rules/space-misuse": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			expect(messages.some((m) => m.ruleId === "rules/space-misuse")).toBe(true)
			// Should report both horizontal and vertical issues
			expect(
				messages.some(
					(m) =>
						(m.message.includes("right") || m.message.includes("left")) &&
						(m.message.includes("bottom") || m.message.includes("top")),
				),
			).toBe(true)
		},
	)

	test(
		"does not trigger for containers with no visible children",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  html, body { margin: 0; padding: 0; height: 100%; }
  body {
    display: grid;
    place-items: start;
  }
  #container {
    width: 300px;
    height: 200px;
    border: 1px solid #000;
  }
  #hidden {
    display: none;
    width: 100px;
    height: 50px;
    background: #ccc;
  }
</style>

<div id="container">
  <div id="hidden">Hidden</div>
</div>
`,
				{
					"rules/space-misuse": "error",
				},
			)

			// Filter to only check for issues reported on #container
			const containerMessages = (result?.messages ?? []).filter(
				(m) =>
					m.ruleId === "rules/space-misuse" &&
					m.location.element.id === "container",
			)
			expect(containerMessages).toHaveLength(0)
		},
	)
})
