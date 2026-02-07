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

describe("@viewlint/rules clipping + ellipsis ignores", () => {
	test(
		"text-overflow: ellipsis does not trigger text-overflow, container-overflow, or clipped-content",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #wrap {
    width: 160px;
    padding: 8px;
    border: 1px solid #000;
  }
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

<div id="wrap">
  <div id="ellipsis">
    <span>THIS IS A VERY VERY VERY VERY VERY VERY LONG LINE OF TEXT</span>
  </div>
</div>
`,
				{
					"rules/text-overflow": "error",
					"rules/container-overflow": "error",
					"rules/clipped-content": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"elements clipped by an intentionally clipped parent do not trigger hit-target-obscured, container-overflow, or clipped-content",
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
  #inner {
    width: 90px;
    height: 20px;
    overflow: hidden;
    white-space: nowrap;
    border: 1px solid #000;
    font: 16px/1 monospace;
  }
</style>

<div id="clipper">
  <button id="btn">Click</button>
  <div id="inner">THIS IS A VERY VERY VERY VERY VERY VERY LONG LINE OF TEXT</div>
</div>
`,
				{
					"rules/hit-target-obscured": "error",
					"rules/container-overflow": "error",
					"rules/clipped-content": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"clipped-content still reports when clipping is not intentional",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  #box {
    width: 120px;
    overflow: hidden;
    white-space: nowrap;
    border: 1px solid #000;
    font: 16px/1 monospace;
  }
</style>

<div id="box">THIS IS A VERY VERY VERY VERY VERY VERY LONG LINE OF TEXT</div>
`,
				{
					"rules/clipped-content": "error",
				},
			)

			const messages = result?.messages ?? []
			expect(messages.length).toBeGreaterThan(0)
			expect(messages.some((m) => m.ruleId === "rules/clipped-content")).toBe(
				true,
			)
		},
	)

	test(
		"line-clamp does not trigger clipped-content",
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
    -webkit-line-clamp: 1;
  }
</style>

<div id="clamped">
  THIS IS A VERY VERY VERY VERY VERY VERY VERY VERY VERY LONG BLOCK OF TEXT THAT WRAPS
</div>
`,
				{
					"rules/clipped-content": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"small vertical crop in rounded media container does not trigger clipped-content",
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
    height: 102px;
  }
</style>

<div id="thumb">
  <img alt="" src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='1' height='1'></svg>" />
</div>
`,
				{
					"rules/clipped-content": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"visually hidden text (clip/clip-path) does not trigger text-overflow",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  .visuallyhidden {
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

<label>
  <span class="visuallyhidden">THIS IS A VERY VERY VERY VERY VERY VERY LONG LABEL</span>
  <input />
</label>
`,
				{
					"rules/text-overflow": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"hit-target-obscured ignores label/control overlay patterns",
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
		"overlapped-elements ignores expected float text wrapping",
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
    It should not count as an overlap bug.
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
		"negative-margin gutters do not trigger clipped-content",
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
				{
					"rules/clipped-content": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"container-overflow ignores child overflow clipped by a line-clamped ancestor",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  h3 {
    width: 160px;
    font: 16px/18px monospace;
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 1;
  }

  a {
    display: block;
    height: 18px;
    border: 1px solid #000;
  }

  span {
    display: block;
    height: 80px;
  }
</style>

<h3>
  <a href="#">
    <span>Very tall content that is intentionally clipped by the line clamp</span>
  </a>
</h3>
`,
				{
					"rules/container-overflow": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)

	test(
		"overlapped-elements ignores thin-strip overlaps",
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
		"avatar-like media in rounded clip does not trigger clipped-content",
		{ timeout: 60_000 },
		async () => {
			const result = await lintHtml(
				`
<style>
  .avatar {
    display: block;
    width: 32px;
    height: 32px;
    border: 1px solid #000;
    border-radius: 50%;
    overflow: hidden;
    font: 14px/27px sans-serif;
    background: #fff;
  }
</style>

<span class="avatar">
  <img alt="" width="30" height="30" src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='30' height='30'><rect width='30' height='30' fill='black'/></svg>"> 
</span>
`,
				{
					"rules/clipped-content": "error",
				},
			)

			expect(result?.messages ?? []).toHaveLength(0)
		},
	)
})
