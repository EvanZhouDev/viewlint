import type { ElementHandle, JSHandle, Locator, Page } from "playwright"

import type { BrowserScope, NodeScope, Scope, SetupOpts } from "../types.js"
import { toArray } from "../helpers.js"

export type ResolvedRuleScope = {
	rootHandles: ElementHandle<Node>[]
	rootLocators: Locator[]
	nodeScope: NodeScope
	browserScopeHandle: JSHandle<BrowserScope>
}

const ROOT_ID_ATTR = "data-viewlint-root-id"

// Creates JSHandle (function that can be passed to Playwright browser-side) to access roots
async function createBrowserScopeHandle(
	page: Page,
	rootHandles: ElementHandle<Node>[],
): Promise<JSHandle<BrowserScope>> {
	return await page.evaluateHandle((roots: Node[]) => {
		const elementRoots: Element[] = []
		for (const root of roots) {
			if (root instanceof Element) elementRoots.push(root)
		}

		function queryAll(selector: string): Element[] {
			const results: Element[] = []
			const seen = new Set<Element>()

			for (const root of elementRoots) {
				if (root.matches(selector) && !seen.has(root)) {
					seen.add(root)
					results.push(root)
				}

				const matches = root.querySelectorAll(selector)
				for (const el of matches) {
					if (seen.has(el)) continue
					seen.add(el)
					results.push(el)
				}
			}

			return results
		}

		function query(selector: string): Element | null {
			for (const root of elementRoots) {
				if (root.matches(selector)) return root
				const match = root.querySelector(selector)
				if (match) return match
			}
			return null
		}

		return {
			roots: elementRoots,
			queryAll,
			query,
		}
	}, rootHandles)
}

function createNodeScope(page: Page, rootLocators: Locator[]): NodeScope {
	return {
		roots: rootLocators,
		locator(selector: string): Locator {
			if (rootLocators.length === 0) return page.locator(selector)
			const [firstRoot, ...restRoots] = rootLocators
			if (!firstRoot) return page.locator(selector)

			let mergedRoots = firstRoot
			for (const root of restRoots) {
				mergedRoots = mergedRoots.or(root)
			}

			return mergedRoots.locator(selector)
		},
	}
}

async function ensureRootId(handle: ElementHandle<Node>): Promise<string> {
	const id = await handle.evaluate((node) => {
		if (!(node instanceof Element)) {
			throw new Error("Expected scope root to be an Element")
		}

		let existing = node.getAttribute(ROOT_ID_ATTR)
		if (!existing) {
			existing = crypto.randomUUID()
			node.setAttribute(ROOT_ID_ATTR, existing)
		}
		return existing
	})

	if (!id) {
		throw new Error(
			"viewlint internal error: expected data-viewlint-root-id to be set",
		)
	}

	return id
}

async function resolveDefaultRootHandles(
	page: Page,
): Promise<ElementHandle<Node>[]> {
	const body = await page.locator("body").elementHandle()
	if (!body) {
		throw new Error("Failed to resolve document.body for default scope")
	}

	await ensureRootId(body)
	return [body]
}

async function resolveScopeLocators(args: {
	page: Page
	opts: SetupOpts
	scopes: Scope | Scope[] | undefined
}): Promise<Locator[]> {
	const scopeList = toArray(args.scopes)

	if (scopeList.length === 0) return []

	const locators: Locator[] = []
	for (const scope of scopeList) {
		const resolved = await scope.getLocator({
			page: args.page,
			opts: args.opts,
		})
		if (Array.isArray(resolved)) {
			locators.push(...resolved)
		} else {
			locators.push(resolved)
		}
	}

	return locators
}

// Note that locators are **not stable**. In order to ensure that the same elements are referred to by both the Node.js scope locators and the browser-side handles, we give all elements with a locator a `data-viewlint-root-id` and then use those IDs as locators to create stable references.
export async function resolveRuleScope(args: {
	page: Page
	opts: SetupOpts
	scopes: Scope | Scope[] | undefined
}): Promise<ResolvedRuleScope> {
	const requestedRootLocators = await resolveScopeLocators(args)

	const initialHandles: ElementHandle<Node>[] = []

	if (requestedRootLocators.length === 0) {
		// If no root locators, then we just use the body as the root.
		initialHandles.push(...(await resolveDefaultRootHandles(args.page)))
	} else {
		for (const locator of requestedRootLocators) {
			const handles = await locator.elementHandles()
			for (const handle of handles) initialHandles.push(handle)
		}
	}

	if (initialHandles.length === 0) {
		throw new Error(
			"Scope resolved to zero root elements. Ensure your scope locators match at least one element.",
		)
	}

	const rootHandles: ElementHandle<Node>[] = []
	const seen = new Set<string>()

	for (const handle of initialHandles) {
		const id = await ensureRootId(handle)
		if (seen.has(id)) continue
		seen.add(id)
		rootHandles.push(handle)
	}

	const rootLocators: Locator[] = []
	for (const handle of rootHandles) {
		const id = await handle.evaluate((node) => {
			if (!(node instanceof Element)) return null
			return node.getAttribute(ROOT_ID_ATTR)
		})
		if (!id) continue
		rootLocators.push(args.page.locator(`[${ROOT_ID_ATTR}="${id}"]`))
	}

	const nodeScope = createNodeScope(args.page, rootLocators)
	const browserScopeHandle = await createBrowserScopeHandle(
		args.page,
		rootHandles,
	)

	return {
		rootHandles,
		rootLocators,
		nodeScope,
		browserScopeHandle,
	}
}

export async function disposeRuleScope(
	scope: ResolvedRuleScope,
): Promise<void> {
	await scope.browserScopeHandle.dispose().catch(() => {})

	for (const handle of scope.rootHandles) {
		await handle.dispose().catch(() => {})
	}
}
