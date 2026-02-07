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

describe("@viewlint/rules hit-target-obscured", () => {
	// ==========================================================================
	// 1. Basic obscured detection - button covered by another element
	// ==========================================================================

	test(
		"detects button completely covered by another element",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    position: relative;
    width: 200px;
    height: 100px;
  }
  #btn {
    position: absolute;
    left: 20px;
    top: 20px;
    width: 100px;
    height: 40px;
  }
  #overlay {
    position: absolute;
    left: 0;
    top: 0;
    width: 200px;
    height: 100px;
    background: rgba(0, 0, 0, 0.5);
    z-index: 10;
  }
</style>

<div id="container">
  <button id="btn">Click me</button>
  <div id="overlay"></div>
</div>
`,
				{
					"rules/hit-target-obscured": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			expect(
				messages.some((m) => m.ruleId === "rules/hit-target-obscured"),
			).toBe(true)
		},
	)

	test(
		"detects link partially covered by another element (>50%)",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    position: relative;
    width: 200px;
    height: 100px;
  }
  #link {
    position: absolute;
    left: 20px;
    top: 20px;
    width: 100px;
    height: 40px;
    display: block;
    background: #eee;
  }
  #overlay {
    position: absolute;
    left: 20px;
    top: 20px;
    width: 80px;
    height: 40px;
    background: rgba(255, 0, 0, 0.5);
    z-index: 10;
  }
</style>

<div id="container">
  <a id="link" href="#">Click me</a>
  <div id="overlay"></div>
</div>
`,
				{
					"rules/hit-target-obscured": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			expect(
				messages.some((m) => m.ruleId === "rules/hit-target-obscured"),
			).toBe(true)
		},
	)

	// ==========================================================================
	// 2. NOT triggered for disabled elements
	// ==========================================================================

	test(
		"does not trigger for disabled button covered by overlay",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    position: relative;
    width: 200px;
    height: 100px;
  }
  #btn {
    position: absolute;
    left: 20px;
    top: 20px;
    width: 100px;
    height: 40px;
  }
  #overlay {
    position: absolute;
    left: 0;
    top: 0;
    width: 200px;
    height: 100px;
    background: rgba(0, 0, 0, 0.5);
    z-index: 10;
  }
</style>

<div id="container">
  <button id="btn" disabled>Click me</button>
  <div id="overlay"></div>
</div>
`,
				{
					"rules/hit-target-obscured": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"does not trigger for aria-disabled button covered by overlay",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    position: relative;
    width: 200px;
    height: 100px;
  }
  #btn {
    position: absolute;
    left: 20px;
    top: 20px;
    width: 100px;
    height: 40px;
  }
  #overlay {
    position: absolute;
    left: 0;
    top: 0;
    width: 200px;
    height: 100px;
    background: rgba(0, 0, 0, 0.5);
    z-index: 10;
  }
</style>

<div id="container">
  <button id="btn" aria-disabled="true">Click me</button>
  <div id="overlay"></div>
</div>
`,
				{
					"rules/hit-target-obscured": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	// ==========================================================================
	// 3. NOT triggered for label/control pairs (label overlaying input)
	// ==========================================================================

	test(
		"does not trigger for label overlaying its associated input",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #wrap {
    position: relative;
    width: 60px;
    height: 60px;
  }
  #control {
    position: absolute;
    inset: 0;
    opacity: 0;
  }
  #label {
    position: absolute;
    inset: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid #000;
    background: transparent;
  }
</style>

<div id="wrap">
  <input id="control" type="checkbox" />
  <label id="label" for="control">Menu</label>
</div>
`,
				{
					"rules/hit-target-obscured": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"does not trigger for label containing its control (implicit association)",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #label {
    position: relative;
    display: block;
    width: 200px;
    height: 50px;
    padding: 10px;
    border: 1px solid #000;
  }
  #label input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
  }
  #label span {
    position: relative;
    z-index: 1;
  }
</style>

<label id="label">
  <span>Toggle</span>
  <input type="checkbox" />
</label>
`,
				{
					"rules/hit-target-obscured": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	// ==========================================================================
	// 4. NOT triggered for effectively invisible overlays (opacity:0, transparent)
	// ==========================================================================

	test(
		"does not trigger when overlay has opacity: 0",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    position: relative;
    width: 200px;
    height: 100px;
  }
  #btn {
    position: absolute;
    left: 20px;
    top: 20px;
    width: 100px;
    height: 40px;
  }
  #overlay {
    position: absolute;
    left: 0;
    top: 0;
    width: 200px;
    height: 100px;
    background: red;
    opacity: 0;
    z-index: 10;
  }
</style>

<div id="container">
  <button id="btn">Click me</button>
  <div id="overlay"></div>
</div>
`,
				{
					"rules/hit-target-obscured": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"does not trigger when overlay is fully transparent (no visible styles)",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    position: relative;
    width: 200px;
    height: 100px;
  }
  #btn {
    position: absolute;
    left: 20px;
    top: 20px;
    width: 100px;
    height: 40px;
  }
  #overlay {
    position: absolute;
    left: 0;
    top: 0;
    width: 200px;
    height: 100px;
    background: transparent;
    z-index: 10;
  }
</style>

<div id="container">
  <button id="btn">Click me</button>
  <div id="overlay"></div>
</div>
`,
				{
					"rules/hit-target-obscured": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"does not trigger when overlay has rgba with alpha 0",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    position: relative;
    width: 200px;
    height: 100px;
  }
  #btn {
    position: absolute;
    left: 20px;
    top: 20px;
    width: 100px;
    height: 40px;
  }
  #overlay {
    position: absolute;
    left: 0;
    top: 0;
    width: 200px;
    height: 100px;
    background: rgba(255, 0, 0, 0);
    z-index: 10;
  }
</style>

<div id="container">
  <button id="btn">Click me</button>
  <div id="overlay"></div>
</div>
`,
				{
					"rules/hit-target-obscured": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	// ==========================================================================
	// 5. NOT triggered when element is clipped by intentionally clipped ancestor
	// ==========================================================================

	test(
		"does not trigger when button is clipped by ancestor with border-radius and overflow:hidden",
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
				{
					"rules/hit-target-obscured": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"does not trigger when link is inside container with clip-path",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #clipper {
    position: relative;
    width: 150px;
    height: 80px;
    clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%);
    border: 1px solid #000;
  }
  #link {
    position: absolute;
    left: -20px;
    top: 10px;
    width: 100px;
    height: 30px;
    display: block;
    background: #eee;
  }
</style>

<div id="clipper">
  <a id="link" href="#">Clipped Link</a>
</div>
`,
				{
					"rules/hit-target-obscured": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	// ==========================================================================
	// 6. Triggered when >50% of click targets are obscured
	// ==========================================================================

	test(
		"triggers when more than 50% of button is obscured",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    position: relative;
    width: 200px;
    height: 100px;
  }
  #btn {
    position: absolute;
    left: 0;
    top: 0;
    width: 100px;
    height: 40px;
  }
  #overlay {
    position: absolute;
    left: 0;
    top: 0;
    width: 60px;
    height: 40px;
    background: rgba(0, 0, 0, 0.8);
    z-index: 10;
  }
</style>

<div id="container">
  <button id="btn">Click me</button>
  <div id="overlay"></div>
</div>
`,
				{
					"rules/hit-target-obscured": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			expect(
				messages.some((m) => m.ruleId === "rules/hit-target-obscured"),
			).toBe(true)
		},
	)

	test(
		"does not trigger when less than 50% of button is obscured",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    position: relative;
    width: 200px;
    height: 100px;
  }
  #btn {
    position: absolute;
    left: 0;
    top: 0;
    width: 100px;
    height: 40px;
  }
  #overlay {
    position: absolute;
    left: 0;
    top: 0;
    width: 30px;
    height: 20px;
    background: rgba(0, 0, 0, 0.8);
    z-index: 10;
  }
</style>

<div id="container">
  <button id="btn">Click me</button>
  <div id="overlay"></div>
</div>
`,
				{
					"rules/hit-target-obscured": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	// ==========================================================================
	// 7. NOT triggered when obscuring element is a form control descendant
	// ==========================================================================

	test(
		"does not trigger when button contains a form control descendant at point",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #btn {
    position: relative;
    width: 200px;
    height: 50px;
    padding: 10px;
    border: 1px solid #000;
    background: #eee;
  }
  #btn span {
    display: inline-block;
    padding: 5px 10px;
    background: #fff;
  }
</style>

<button id="btn">
  <span>Click here</span>
</button>
`,
				{
					"rules/hit-target-obscured": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"does not trigger for link with nested span element",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #link {
    display: inline-block;
    width: 150px;
    height: 40px;
    padding: 10px;
    background: #eee;
    text-decoration: none;
  }
  #link span {
    display: block;
    background: #fff;
    padding: 5px;
  }
</style>

<a id="link" href="#">
  <span>Link text</span>
</a>
`,
				{
					"rules/hit-target-obscured": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	// ==========================================================================
	// 8. Reports percentage of obscured area
	// ==========================================================================

	test(
		"reports approximate percentage of obscured area in message",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    position: relative;
    width: 200px;
    height: 100px;
  }
  #btn {
    position: absolute;
    left: 20px;
    top: 20px;
    width: 100px;
    height: 40px;
  }
  #overlay {
    position: absolute;
    left: 0;
    top: 0;
    width: 200px;
    height: 100px;
    background: rgba(0, 0, 0, 0.5);
    z-index: 10;
  }
</style>

<div id="container">
  <button id="btn">Click me</button>
  <div id="overlay"></div>
</div>
`,
				{
					"rules/hit-target-obscured": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)

			const obscuredMessage = messages.find(
				(m) => m.ruleId === "rules/hit-target-obscured",
			)
			expect(obscuredMessage).toBeDefined()
			expect(obscuredMessage?.message).toMatch(/~\d+% obscured/)
		},
	)

	// ==========================================================================
	// 9. Includes "Obscuring element" relation in report
	// ==========================================================================

	test(
		"includes obscuring element relation in report",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    position: relative;
    width: 200px;
    height: 100px;
  }
  #btn {
    position: absolute;
    left: 20px;
    top: 20px;
    width: 100px;
    height: 40px;
  }
  #blocker {
    position: absolute;
    left: 0;
    top: 0;
    width: 200px;
    height: 100px;
    background: red;
    z-index: 10;
  }
</style>

<div id="container">
  <button id="btn">Click me</button>
  <div id="blocker"></div>
</div>
`,
				{
					"rules/hit-target-obscured": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)

			const obscuredMessage = messages.find(
				(m) => m.ruleId === "rules/hit-target-obscured",
			)
			expect(obscuredMessage).toBeDefined()
			expect(obscuredMessage?.relations).toBeDefined()
			expect(obscuredMessage?.relations?.length).toBeGreaterThan(0)

			const obscuringRelation = obscuredMessage?.relations?.find(
				(r) => r.description === "Obscuring element",
			)
			expect(obscuringRelation).toBeDefined()
		},
	)

	// ==========================================================================
	// 10. Only checks interactive elements
	// ==========================================================================

	test(
		"triggers for anchor element (a) that is obscured",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    position: relative;
    width: 200px;
    height: 100px;
  }
  #link {
    position: absolute;
    left: 20px;
    top: 20px;
    width: 100px;
    height: 40px;
    display: block;
    background: #eee;
  }
  #overlay {
    position: absolute;
    left: 0;
    top: 0;
    width: 200px;
    height: 100px;
    background: rgba(0, 0, 0, 0.5);
    z-index: 10;
  }
</style>

<div id="container">
  <a id="link" href="#">Click</a>
  <div id="overlay"></div>
</div>
`,
				{
					"rules/hit-target-obscured": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(
				messages.some((m) => m.ruleId === "rules/hit-target-obscured"),
			).toBe(true)
		},
	)

	test(
		"triggers for input element that is obscured",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    position: relative;
    width: 200px;
    height: 100px;
  }
  #input {
    position: absolute;
    left: 20px;
    top: 20px;
    width: 100px;
    height: 30px;
  }
  #overlay {
    position: absolute;
    left: 0;
    top: 0;
    width: 200px;
    height: 100px;
    background: rgba(0, 0, 0, 0.5);
    z-index: 10;
  }
</style>

<div id="container">
  <input id="input" type="text" placeholder="Type here" />
  <div id="overlay"></div>
</div>
`,
				{
					"rules/hit-target-obscured": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(
				messages.some((m) => m.ruleId === "rules/hit-target-obscured"),
			).toBe(true)
		},
	)

	test(
		"triggers for select element that is obscured",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    position: relative;
    width: 200px;
    height: 100px;
  }
  #select {
    position: absolute;
    left: 20px;
    top: 20px;
    width: 100px;
    height: 30px;
  }
  #overlay {
    position: absolute;
    left: 0;
    top: 0;
    width: 200px;
    height: 100px;
    background: rgba(0, 0, 0, 0.5);
    z-index: 10;
  }
</style>

<div id="container">
  <select id="select">
    <option>Option 1</option>
    <option>Option 2</option>
  </select>
  <div id="overlay"></div>
</div>
`,
				{
					"rules/hit-target-obscured": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(
				messages.some((m) => m.ruleId === "rules/hit-target-obscured"),
			).toBe(true)
		},
	)

	test(
		"triggers for textarea element that is obscured",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    position: relative;
    width: 200px;
    height: 150px;
  }
  #textarea {
    position: absolute;
    left: 20px;
    top: 20px;
    width: 150px;
    height: 80px;
  }
  #overlay {
    position: absolute;
    left: 0;
    top: 0;
    width: 200px;
    height: 150px;
    background: rgba(0, 0, 0, 0.5);
    z-index: 10;
  }
</style>

<div id="container">
  <textarea id="textarea">Some text</textarea>
  <div id="overlay"></div>
</div>
`,
				{
					"rules/hit-target-obscured": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(
				messages.some((m) => m.ruleId === "rules/hit-target-obscured"),
			).toBe(true)
		},
	)

	test(
		"triggers for element with onclick attribute that is obscured",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    position: relative;
    width: 200px;
    height: 100px;
  }
  #clickable {
    position: absolute;
    left: 20px;
    top: 20px;
    width: 100px;
    height: 40px;
    background: #eee;
    cursor: pointer;
  }
  #overlay {
    position: absolute;
    left: 0;
    top: 0;
    width: 200px;
    height: 100px;
    background: rgba(0, 0, 0, 0.5);
    z-index: 10;
  }
</style>

<div id="container">
  <div id="clickable" onclick="alert('clicked')">Click me</div>
  <div id="overlay"></div>
</div>
`,
				{
					"rules/hit-target-obscured": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(
				messages.some((m) => m.ruleId === "rules/hit-target-obscured"),
			).toBe(true)
		},
	)

	test(
		"triggers for element with tabindex>=0 that is obscured",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    position: relative;
    width: 200px;
    height: 100px;
  }
  #focusable {
    position: absolute;
    left: 20px;
    top: 20px;
    width: 100px;
    height: 40px;
    background: #eee;
  }
  #overlay {
    position: absolute;
    left: 0;
    top: 0;
    width: 200px;
    height: 100px;
    background: rgba(0, 0, 0, 0.5);
    z-index: 10;
  }
</style>

<div id="container">
  <div id="focusable" tabindex="0">Focus me</div>
  <div id="overlay"></div>
</div>
`,
				{
					"rules/hit-target-obscured": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(
				messages.some((m) => m.ruleId === "rules/hit-target-obscured"),
			).toBe(true)
		},
	)

	test(
		"triggers for element with role=button that is obscured",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    position: relative;
    width: 200px;
    height: 100px;
  }
  #custom-btn {
    position: absolute;
    left: 20px;
    top: 20px;
    width: 100px;
    height: 40px;
    background: #eee;
    cursor: pointer;
  }
  #overlay {
    position: absolute;
    left: 0;
    top: 0;
    width: 200px;
    height: 100px;
    background: rgba(0, 0, 0, 0.5);
    z-index: 10;
  }
</style>

<div id="container">
  <div id="custom-btn" role="button">Click</div>
  <div id="overlay"></div>
</div>
`,
				{
					"rules/hit-target-obscured": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(
				messages.some((m) => m.ruleId === "rules/hit-target-obscured"),
			).toBe(true)
		},
	)

	test(
		"triggers for element with role=link that is obscured",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    position: relative;
    width: 200px;
    height: 100px;
  }
  #custom-link {
    position: absolute;
    left: 20px;
    top: 20px;
    width: 100px;
    height: 40px;
    background: #eee;
    cursor: pointer;
  }
  #overlay {
    position: absolute;
    left: 0;
    top: 0;
    width: 200px;
    height: 100px;
    background: rgba(0, 0, 0, 0.5);
    z-index: 10;
  }
</style>

<div id="container">
  <span id="custom-link" role="link">Link</span>
  <div id="overlay"></div>
</div>
`,
				{
					"rules/hit-target-obscured": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(
				messages.some((m) => m.ruleId === "rules/hit-target-obscured"),
			).toBe(true)
		},
	)

	test(
		"triggers for element with role=menuitem that is obscured",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    position: relative;
    width: 200px;
    height: 100px;
  }
  #menu-item {
    position: absolute;
    left: 20px;
    top: 20px;
    width: 100px;
    height: 40px;
    background: #eee;
    cursor: pointer;
  }
  #overlay {
    position: absolute;
    left: 0;
    top: 0;
    width: 200px;
    height: 100px;
    background: rgba(0, 0, 0, 0.5);
    z-index: 10;
  }
</style>

<div id="container">
  <div id="menu-item" role="menuitem">Menu Item</div>
  <div id="overlay"></div>
</div>
`,
				{
					"rules/hit-target-obscured": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(
				messages.some((m) => m.ruleId === "rules/hit-target-obscured"),
			).toBe(true)
		},
	)

	test(
		"does not trigger for non-interactive element that is obscured",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    position: relative;
    width: 200px;
    height: 100px;
  }
  #text {
    position: absolute;
    left: 20px;
    top: 20px;
    width: 100px;
    height: 40px;
    background: #eee;
  }
  #overlay {
    position: absolute;
    left: 0;
    top: 0;
    width: 200px;
    height: 100px;
    background: rgba(0, 0, 0, 0.5);
    z-index: 10;
  }
</style>

<div id="container">
  <div id="text">Just text</div>
  <div id="overlay"></div>
</div>
`,
				{
					"rules/hit-target-obscured": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"does not trigger for element with negative tabindex that is obscured",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    position: relative;
    width: 200px;
    height: 100px;
  }
  #non-focusable {
    position: absolute;
    left: 20px;
    top: 20px;
    width: 100px;
    height: 40px;
    background: #eee;
  }
  #overlay {
    position: absolute;
    left: 0;
    top: 0;
    width: 200px;
    height: 100px;
    background: rgba(0, 0, 0, 0.5);
    z-index: 10;
  }
</style>

<div id="container">
  <div id="non-focusable" tabindex="-1">Not focusable via tab</div>
  <div id="overlay"></div>
</div>
`,
				{
					"rules/hit-target-obscured": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	// ==========================================================================
	// Additional edge cases
	// ==========================================================================

	test(
		"does not trigger for label element (interactive tag) that is not obscured",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #label {
    display: inline-block;
    width: 100px;
    height: 30px;
    background: #eee;
  }
</style>

<label id="label" for="input">Label</label>
<input id="input" type="text" />
`,
				{
					"rules/hit-target-obscured": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"triggers for label element that is obscured by non-associated element",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    position: relative;
    width: 200px;
    height: 100px;
  }
  #label {
    position: absolute;
    left: 20px;
    top: 20px;
    width: 100px;
    height: 30px;
    background: #eee;
  }
  #overlay {
    position: absolute;
    left: 0;
    top: 0;
    width: 200px;
    height: 100px;
    background: rgba(0, 0, 0, 0.5);
    z-index: 10;
  }
</style>

<div id="container">
  <label id="label" for="input">Label</label>
  <div id="overlay"></div>
</div>
<input id="input" type="text" />
`,
				{
					"rules/hit-target-obscured": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(
				messages.some((m) => m.ruleId === "rules/hit-target-obscured"),
			).toBe(true)
		},
	)

	test(
		"does not trigger when button is outside viewport",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    position: relative;
    width: 200px;
    height: 100px;
  }
  #btn {
    position: absolute;
    left: 20px;
    top: -1000px;
    width: 100px;
    height: 40px;
  }
  #overlay {
    position: absolute;
    left: 0;
    top: -1000px;
    width: 200px;
    height: 100px;
    background: rgba(0, 0, 0, 0.5);
    z-index: 10;
  }
</style>

<div id="container">
  <button id="btn">Click me</button>
  <div id="overlay"></div>
</div>
`,
				{
					"rules/hit-target-obscured": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"does not trigger for hidden button (display: none)",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    position: relative;
    width: 200px;
    height: 100px;
  }
  #btn {
    display: none;
    position: absolute;
    left: 20px;
    top: 20px;
    width: 100px;
    height: 40px;
  }
  #overlay {
    position: absolute;
    left: 0;
    top: 0;
    width: 200px;
    height: 100px;
    background: rgba(0, 0, 0, 0.5);
    z-index: 10;
  }
</style>

<div id="container">
  <button id="btn">Click me</button>
  <div id="overlay"></div>
</div>
`,
				{
					"rules/hit-target-obscured": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"does not trigger for button with visibility: hidden",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    position: relative;
    width: 200px;
    height: 100px;
  }
  #btn {
    visibility: hidden;
    position: absolute;
    left: 20px;
    top: 20px;
    width: 100px;
    height: 40px;
  }
  #overlay {
    position: absolute;
    left: 0;
    top: 0;
    width: 200px;
    height: 100px;
    background: rgba(0, 0, 0, 0.5);
    z-index: 10;
  }
</style>

<div id="container">
  <button id="btn">Click me</button>
  <div id="overlay"></div>
</div>
`,
				{
					"rules/hit-target-obscured": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"does not trigger for button with pointer-events: none",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    position: relative;
    width: 200px;
    height: 100px;
  }
  #btn {
    pointer-events: none;
    position: absolute;
    left: 20px;
    top: 20px;
    width: 100px;
    height: 40px;
  }
  #overlay {
    position: absolute;
    left: 0;
    top: 0;
    width: 200px;
    height: 100px;
    background: rgba(0, 0, 0, 0.5);
    z-index: 10;
  }
</style>

<div id="container">
  <button id="btn">Click me</button>
  <div id="overlay"></div>
</div>
`,
				{
					"rules/hit-target-obscured": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"triggers when overlay has visible text content",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    position: relative;
    width: 200px;
    height: 100px;
  }
  #btn {
    position: absolute;
    left: 20px;
    top: 20px;
    width: 100px;
    height: 40px;
  }
  #overlay {
    position: absolute;
    left: 0;
    top: 0;
    width: 200px;
    height: 100px;
    background: transparent;
    z-index: 10;
    color: black;
    font-size: 16px;
  }
</style>

<div id="container">
  <button id="btn">Click me</button>
  <div id="overlay">This overlay has text</div>
</div>
`,
				{
					"rules/hit-target-obscured": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(
				messages.some((m) => m.ruleId === "rules/hit-target-obscured"),
			).toBe(true)
		},
	)

	test(
		"triggers when overlay has border but transparent background",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    position: relative;
    width: 200px;
    height: 100px;
  }
  #btn {
    position: absolute;
    left: 20px;
    top: 20px;
    width: 100px;
    height: 40px;
  }
  #overlay {
    position: absolute;
    left: 0;
    top: 0;
    width: 200px;
    height: 100px;
    background: transparent;
    border: 2px solid red;
    z-index: 10;
  }
</style>

<div id="container">
  <button id="btn">Click me</button>
  <div id="overlay"></div>
</div>
`,
				{
					"rules/hit-target-obscured": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(
				messages.some((m) => m.ruleId === "rules/hit-target-obscured"),
			).toBe(true)
		},
	)

	test(
		"triggers when overlay has box-shadow but transparent background",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    position: relative;
    width: 200px;
    height: 100px;
  }
  #btn {
    position: absolute;
    left: 20px;
    top: 20px;
    width: 100px;
    height: 40px;
  }
  #overlay {
    position: absolute;
    left: 0;
    top: 0;
    width: 200px;
    height: 100px;
    background: transparent;
    box-shadow: 0 0 10px rgba(0,0,0,0.5);
    z-index: 10;
  }
</style>

<div id="container">
  <button id="btn">Click me</button>
  <div id="overlay"></div>
</div>
`,
				{
					"rules/hit-target-obscured": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(
				messages.some((m) => m.ruleId === "rules/hit-target-obscured"),
			).toBe(true)
		},
	)

	test(
		"triggers when overlay has background-image but transparent background",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #container {
    position: relative;
    width: 200px;
    height: 100px;
  }
  #btn {
    position: absolute;
    left: 20px;
    top: 20px;
    width: 100px;
    height: 40px;
  }
  #overlay {
    position: absolute;
    left: 0;
    top: 0;
    width: 200px;
    height: 100px;
    background: transparent url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect fill="red" width="10" height="10"/></svg>');
    z-index: 10;
  }
</style>

<div id="container">
  <button id="btn">Click me</button>
  <div id="overlay"></div>
</div>
`,
				{
					"rules/hit-target-obscured": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(
				messages.some((m) => m.ruleId === "rules/hit-target-obscured"),
			).toBe(true)
		},
	)
})
