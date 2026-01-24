import fs from "node:fs"

import type { Page } from "playwright"

declare global {
	interface Window {
		__viewlint_finder?: (el: Element) => string
	}
}

let cachedFinderInitScript: string | undefined

function getFinderInitScript(): string {
	if (cachedFinderInitScript) return cachedFinderInitScript

	const raw = fs.readFileSync(
		new URL("../vendor/medv.finder.js", import.meta.url),
		"utf8",
	)

	const asBrowserScript = raw.split("export ").join("")

	cachedFinderInitScript = `${asBrowserScript}

;(function () {
	if (window.__viewlint_finder) return
	window.__viewlint_finder = finder
})()`

	return cachedFinderInitScript
}

export async function ensureFinderRuntime(page: Page): Promise<void> {
	const content = getFinderInitScript()
	await page.addInitScript({ content })

	try {
		await page.addScriptTag({ content })
	} catch {
		// ignore: addScriptTag can fail on some cross-origin / CSP pages.
	}
}

export async function hasFinderRuntime(page: Page): Promise<boolean> {
	try {
		return await page.evaluate(
			() => typeof window.__viewlint_finder === "function",
		)
	} catch {
		return false
	}
}
