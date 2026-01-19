import type { JSHandle, Page } from "playwright"

import type { DomHelpers } from "./domHelpers.js"
import { createDomHelpers } from "./domHelpers.js"

const cache = new WeakMap<Page, JSHandle<DomHelpers>>()
const listenersInstalled = new WeakSet<Page>()

export const getDomHelpersHandle = async (
	page: Page,
): Promise<JSHandle<DomHelpers>> => {
	const cached = cache.get(page)
	if (cached) return cached

	const domHelpers = await page.evaluateHandle(createDomHelpers)
	cache.set(page, domHelpers)

	if (!listenersInstalled.has(page)) {
		listenersInstalled.add(page)

		page.on("framenavigated", (frame) => {
			if (frame !== page.mainFrame()) return

			const current = cache.get(page)
			if (!current) return
			cache.delete(page)
			void current.dispose().catch(() => {})
		})

		page.once("close", () => {
			const current = cache.get(page)
			cache.delete(page)
			void current?.dispose().catch(() => {})
		})
	}

	return domHelpers
}
