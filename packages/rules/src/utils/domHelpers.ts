export type VisibilityOptions = {
	checkOpacity?: boolean
	checkPointerEvents?: boolean
}

export type DomHelpers = {
	isHtmlElement: (el: Element | null) => el is HTMLElement
	isSVGElement: (el: Element | null) => el is SVGElement
	isRenderableElement: (el: Element | null) => el is HTMLElement | SVGElement
	isVisible: (el: Element, options?: VisibilityOptions) => boolean
	hasRectSize: (rect: DOMRect, minWidth?: number, minHeight?: number) => boolean
	hasElementRectSize: (
		el: Element,
		minWidth?: number,
		minHeight?: number,
	) => boolean
	hasClientSize: (
		el: HTMLElement,
		minWidth?: number,
		minHeight?: number,
	) => boolean
	isTextNode: (node: ChildNode) => node is Text
	getDirectTextNodes: (el: HTMLElement, minTextLength?: number) => Text[]
	getTextNodeRects: (textNode: Text, minTextLength?: number) => DOMRect[]
	getTextNodeBounds: (textNode: Text, minTextLength?: number) => DOMRect | null
	getTextRects: (el: HTMLElement, minTextLength?: number) => DOMRect[]
	getTextBounds: (el: HTMLElement, minTextLength?: number) => DOMRect | null
}

/**
 * Runs in browser context via Playwright `page.evaluateHandle`.
 * Must not capture non-serializable values.
 */
export const createDomHelpers = (): DomHelpers => {
	const isHtmlElement = (el: Element | null): el is HTMLElement => {
		// Guard used for TypeScript narrowing inside page context.
		// We intentionally use HTMLElement here so callers can safely call
		// HTMLElement-specific APIs after the check.
		return el instanceof HTMLElement
	}

	const isSVGElement = (el: Element | null): el is SVGElement => {
		return el instanceof SVGElement
	}

	const isRenderableElement = (
		el: Element | null,
	): el is HTMLElement | SVGElement => {
		return isHtmlElement(el) || isSVGElement(el)
	}

	const isVisible = (
		el: Element,
		options: VisibilityOptions = {
			checkOpacity: true,
			checkPointerEvents: false,
		},
	): boolean => {
		const style = window.getComputedStyle(el)

		if (style.display === "none") return false
		if (style.visibility === "hidden" || style.visibility === "collapse") {
			return false
		}

		if (options.checkOpacity && parseFloat(style.opacity) === 0) return false
		if (options.checkPointerEvents && style.pointerEvents === "none")
			return false

		return true
	}

	const hasRectSize = (rect: DOMRect, minWidth = 1, minHeight = 1): boolean => {
		return rect.width >= minWidth && rect.height >= minHeight
	}

	const hasElementRectSize = (
		el: Element,
		minWidth = 1,
		minHeight = 1,
	): boolean => {
		const rect = el.getBoundingClientRect()
		return hasRectSize(rect, minWidth, minHeight)
	}

	const hasClientSize = (
		el: HTMLElement,
		minWidth = 1,
		minHeight = 1,
	): boolean => {
		return el.clientWidth > minWidth || el.clientHeight > minHeight
	}

	const isTextNode = (node: ChildNode): node is Text => {
		return node.nodeType === Node.TEXT_NODE
	}

	const getDirectTextNodes = (el: HTMLElement, minTextLength = 1): Text[] => {
		const textNodes: Text[] = []

		for (const node of el.childNodes) {
			if (!isTextNode(node)) continue

			const text = node.textContent?.trim()
			if (!text || text.length < minTextLength) continue
			textNodes.push(node)
		}

		return textNodes
	}

	const getTextNodeRects = (textNode: Text, minTextLength = 1): DOMRect[] => {
		const text = textNode.textContent?.trim()
		if (!text || text.length < minTextLength) return []

		const range = document.createRange()
		range.selectNodeContents(textNode)
		const rects = range.getClientRects()

		const results: DOMRect[] = []
		for (const rect of rects) {
			if (rect.width === 0 || rect.height === 0) continue
			results.push(rect)
		}

		return results
	}

	const getTextNodeBounds = (
		textNode: Text,
		minTextLength = 1,
	): DOMRect | null => {
		const rects = getTextNodeRects(textNode, minTextLength)
		if (rects.length === 0) return null

		let left = Infinity
		let top = Infinity
		let right = -Infinity
		let bottom = -Infinity

		for (const rect of rects) {
			left = Math.min(left, rect.left)
			top = Math.min(top, rect.top)
			right = Math.max(right, rect.right)
			bottom = Math.max(bottom, rect.bottom)
		}

		if (left === Infinity) return null
		return new DOMRect(left, top, right - left, bottom - top)
	}

	const getTextRects = (el: HTMLElement, minTextLength = 1): DOMRect[] => {
		const results: DOMRect[] = []
		const textNodes = getDirectTextNodes(el, minTextLength)

		for (const node of textNodes) {
			results.push(...getTextNodeRects(node, minTextLength))
		}

		return results
	}

	const getTextBounds = (
		el: HTMLElement,
		minTextLength = 1,
	): DOMRect | null => {
		const rects = getTextRects(el, minTextLength)
		if (rects.length === 0) return null

		let left = Infinity
		let top = Infinity
		let right = -Infinity
		let bottom = -Infinity

		for (const rect of rects) {
			left = Math.min(left, rect.left)
			top = Math.min(top, rect.top)
			right = Math.max(right, rect.right)
			bottom = Math.max(bottom, rect.bottom)
		}

		if (left === Infinity) return null
		return new DOMRect(left, top, right - left, bottom - top)
	}

	return {
		isHtmlElement,
		isSVGElement,
		isRenderableElement,
		isVisible,
		hasRectSize,
		hasElementRectSize,
		hasClientSize,
		isTextNode,
		getDirectTextNodes,
		getTextNodeRects,
		getTextNodeBounds,
		getTextRects,
		getTextBounds,
	}
}
