export type VisibilityOptions = {
	checkOpacity?: boolean
	checkPointerEvents?: boolean
}

/**
 * Represents overflow amounts in each direction.
 */
export type OverflowBox = {
	top: number
	right: number
	bottom: number
	left: number
}

/**
 * Represents a padding box (content + padding area).
 */
export type PaddingBoxSize = {
	width: number
	height: number
}

export type PaddingBoxRect = {
	top: number
	right: number
	bottom: number
	left: number
}

export type DomHelpers = {
	// Type guards
	isHtmlElement: (el: Element | null) => el is HTMLElement
	isSVGElement: (el: Element | null) => el is SVGElement
	isRenderableElement: (el: Element | null) => el is HTMLElement | SVGElement
	isTextNode: (node: ChildNode) => node is Text

	// Visibility checks
	isVisible: (el: Element, options?: VisibilityOptions) => boolean
	isVisibleInViewport: (el: Element, options?: VisibilityOptions) => boolean

	// CSS parsing utilities
	parsePx: (value: string) => number
	getFontSize: (el: HTMLElement) => number

	// Overflow and clipping utilities
	isClippingOverflowValue: (value: string) => boolean
	canScroll: (overflowValue: string) => boolean
	hasTextOverflowEllipsis: (el: HTMLElement) => boolean
	isLineClamped: (el: HTMLElement) => boolean
	isIntentionallyClipped: (el: HTMLElement) => boolean
	findIntentionallyClippedAncestor: (el: Element) => HTMLElement | null
	isElementClippedBy: (
		el: HTMLElement,
		clippingAncestor: HTMLElement,
		threshold?: number,
	) => boolean

	// Size and rect utilities
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
	getPaddingBoxSize: (el: HTMLElement) => PaddingBoxSize
	getPaddingBoxRect: (el: HTMLElement) => PaddingBoxRect

	// Text node utilities
	getDirectTextNodes: (el: HTMLElement, minTextLength?: number) => Text[]
	getTextNodeRects: (textNode: Text, minTextLength?: number) => DOMRect[]
	getTextNodeBounds: (textNode: Text, minTextLength?: number) => DOMRect | null
	getTextRects: (el: HTMLElement, minTextLength?: number) => DOMRect[]
	getTextBounds: (el: HTMLElement, minTextLength?: number) => DOMRect | null

	// Overflow calculation utilities
	getOverflow: (
		containerRect: DOMRect,
		contentRect: DOMRect,
		threshold?: number,
	) => OverflowBox | null
	formatOverflow: (overflow: OverflowBox, threshold?: number) => string
	hasNegativeMargin: (el: HTMLElement) => boolean

	// Layout detection utilities
	isLayoutContainer: (el: HTMLElement) => boolean
	isOffscreenPositioned: (el: HTMLElement) => boolean

	// Rect intersection utilities
	getIntersectionRect: (rectA: DOMRect, rectB: DOMRect) => DOMRect | null
	getIntersectionArea: (rectA: DOMRect, rectB: DOMRect) => number
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

	const isVisible = (el: Element, options: VisibilityOptions = {}): boolean => {
		const resolvedOptions: Required<VisibilityOptions> = {
			checkOpacity: options.checkOpacity ?? true,
			checkPointerEvents: options.checkPointerEvents ?? false,
		}

		const parsePx = (value: string): number => {
			const parsed = Number.parseFloat(value)
			return Number.isFinite(parsed) ? parsed : Number.NaN
		}

		const parseLegacyClipRect = (
			value: string,
		): { top: number; right: number; bottom: number; left: number } | null => {
			const trimmed = value.trim()
			if (trimmed.length === 0) return null
			if (trimmed === "auto") return null

			const match = trimmed.match(/^rect\((.*)\)$/i)
			if (!match) return null

			const raw = match[1] ?? ""
			const parts = raw
				.split(/[,\s]+/)
				.map((x) => x.trim())
				.filter((x) => x.length > 0)
			if (parts.length < 4) return null

			const top = parsePx(parts[0] ?? "")
			const right = parsePx(parts[1] ?? "")
			const bottom = parsePx(parts[2] ?? "")
			const left = parsePx(parts[3] ?? "")

			return { top, right, bottom, left }
		}

		const isLegacyClipRectHidden = (style: CSSStyleDeclaration): boolean => {
			const rect = parseLegacyClipRect(style.clip)
			if (!rect) return false

			return rect.right <= rect.left || rect.bottom <= rect.top
		}

		const isVisuallyHiddenByClipping = (
			target: Element,
			style: CSSStyleDeclaration,
		): boolean => {
			// Screen-reader-only / visually-hidden patterns.
			// These are intentionally invisible in the rendered UI.
			if (style.contentVisibility === "hidden") return true
			if (isLegacyClipRectHidden(style)) return true

			const clipPath = style.clipPath || style.getPropertyValue("clip-path")
			const normalizedClipPath = clipPath
				.trim()
				.toLowerCase()
				.replace(/\s+/g, "")
			const clipPathLooksHidden =
				normalizedClipPath.startsWith("inset(50%") ||
				normalizedClipPath.startsWith("inset(100%") ||
				normalizedClipPath.startsWith("circle(0")

			const rect = target.getBoundingClientRect()
			const isTiny = rect.width <= 1 && rect.height <= 1
			if (!isTiny && !clipPathLooksHidden) return false

			const clipsX = isClippingOverflowValue(style.overflowX)
			const clipsY = isClippingOverflowValue(style.overflowY)
			const clipsBoth = clipsX && clipsY
			if (!clipsBoth && !clipPathLooksHidden && style.clip === "auto")
				return false

			return true
		}

		const ownStyle = window.getComputedStyle(el)
		if (
			resolvedOptions.checkPointerEvents &&
			ownStyle.pointerEvents === "none"
		) {
			return false
		}

		const resolveOpacity = (target: Element): number => {
			let current: Element | null = target
			let effectiveOpacity = 1

			while (current) {
				const opacity = Number.parseFloat(
					window.getComputedStyle(current).opacity,
				)
				const resolvedOpacity = Number.isFinite(opacity) ? opacity : 1
				effectiveOpacity *= resolvedOpacity

				// Early exit if fully transparent
				if (effectiveOpacity === 0) return 0

				current = current.parentElement
			}

			return effectiveOpacity
		}

		if (resolvedOptions.checkOpacity && resolveOpacity(el) === 0) return false

		let current: Element | null = el

		while (current) {
			const style = window.getComputedStyle(current)
			if (isVisuallyHiddenByClipping(current, style)) return false

			if (style.display === "none") return false
			if (style.visibility === "hidden" || style.visibility === "collapse") {
				return false
			}

			current = current.parentElement
		}

		return true
	}

	const isVisibleInViewport = (
		el: Element,
		options?: VisibilityOptions,
	): boolean => {
		if (!isVisible(el, options)) return false

		const rect = el.getBoundingClientRect()
		if (!hasRectSize(rect, 1, 1)) return false

		return (
			rect.bottom > 0 &&
			rect.right > 0 &&
			rect.top < window.innerHeight &&
			rect.left < window.innerWidth
		)
	}

	const isClippingOverflowValue = (value: string): boolean => {
		return value === "hidden" || value === "clip"
	}

	const hasTextOverflowEllipsis = (el: HTMLElement): boolean => {
		const style = window.getComputedStyle(el)
		return style.textOverflow === "ellipsis"
	}

	const hasRoundedCorners = (style: CSSStyleDeclaration): boolean => {
		const radii = [
			style.borderTopLeftRadius,
			style.borderTopRightRadius,
			style.borderBottomRightRadius,
			style.borderBottomLeftRadius,
		]

		for (const value of radii) {
			const parsed = Number.parseFloat(value)
			if (Number.isFinite(parsed) && parsed > 0) return true
		}

		return false
	}

	const hasVisibleDecoration = (style: CSSStyleDeclaration): boolean => {
		const borderWidths = [
			Number.parseFloat(style.borderTopWidth) || 0,
			Number.parseFloat(style.borderRightWidth) || 0,
			Number.parseFloat(style.borderBottomWidth) || 0,
			Number.parseFloat(style.borderLeftWidth) || 0,
		]
		if (borderWidths.some((w) => w > 0)) return true

		const bgImage = style.backgroundImage
		if (bgImage && bgImage !== "none") return true

		const bgColor = style.backgroundColor
		if (
			bgColor &&
			bgColor !== "transparent" &&
			bgColor !== "rgba(0, 0, 0, 0)"
		) {
			return true
		}

		const boxShadow = style.boxShadow
		if (boxShadow && boxShadow !== "none") return true

		return false
	}

	const isIntentionallyClipped = (el: HTMLElement): boolean => {
		if (el.hasAttribute("data-viewlint-clipped")) return true

		const style = window.getComputedStyle(el)

		const isLineClamped = (style: CSSStyleDeclaration): boolean => {
			const raw =
				style.getPropertyValue("-webkit-line-clamp") ||
				style.getPropertyValue("line-clamp")
			const value = raw.trim()
			if (value.length === 0) return false
			if (value === "none") return false
			const parsed = Number.parseFloat(value)
			if (Number.isFinite(parsed)) return parsed > 0
			return true
		}

		const clipPath = style.clipPath || style.getPropertyValue("clip-path")
		if (clipPath && clipPath !== "none") return true

		const maskImage = style.maskImage
		const webkitMaskImage = style.getPropertyValue("-webkit-mask-image")
		if (
			(maskImage && maskImage !== "none") ||
			(webkitMaskImage && webkitMaskImage !== "none")
		) {
			return true
		}

		const clipsX = isClippingOverflowValue(style.overflowX)
		const clipsY = isClippingOverflowValue(style.overflowY)
		if (!clipsX && !clipsY) return false

		if (style.textOverflow === "ellipsis") return true
		if (isLineClamped(style)) return true
		if (hasRoundedCorners(style)) return true
		if (hasVisibleDecoration(style)) return true
		if (style.position !== "static") return true

		return false
	}

	const findIntentionallyClippedAncestor = (
		el: Element,
	): HTMLElement | null => {
		let current = el.parentElement
		while (current) {
			if (isHtmlElement(current) && isIntentionallyClipped(current)) {
				return current
			}
			current = current.parentElement
		}

		return null
	}

	const isElementClippedBy = (
		el: HTMLElement,
		clippingAncestor: HTMLElement,
		threshold = 1,
	): boolean => {
		const rect = el.getBoundingClientRect()
		const clipRect = clippingAncestor.getBoundingClientRect()

		const computedStyle = window.getComputedStyle(clippingAncestor)
		const overflowX = computedStyle.overflowX
		const overflowY = computedStyle.overflowY

		const clipsHorizontally = overflowX !== "visible"
		const clipsVertically = overflowY !== "visible"

		const isClippedHorizontally =
			clipsHorizontally &&
			(rect.left < clipRect.left - threshold ||
				rect.right > clipRect.right + threshold)

		const isClippedVertically =
			clipsVertically &&
			(rect.top < clipRect.top - threshold ||
				rect.bottom > clipRect.bottom + threshold)

		return isClippedHorizontally || isClippedVertically
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
		return el.clientWidth > minWidth && el.clientHeight > minHeight
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

	// =========================================================================
	// NEW SHARED HELPERS
	// =========================================================================

	/**
	 * Parse a CSS pixel value to a number. Returns 0 for invalid values.
	 */
	const parsePx = (value: string): number => {
		const parsed = Number.parseFloat(value)
		return Number.isFinite(parsed) ? parsed : 0
	}

	/**
	 * Get the computed font size of an element in pixels.
	 */
	const getFontSize = (el: HTMLElement): number => {
		const style = window.getComputedStyle(el)
		const parsed = Number.parseFloat(style.fontSize)
		return Number.isFinite(parsed) ? parsed : 16
	}

	/**
	 * Check if an overflow value allows scrolling.
	 */
	const canScroll = (overflowValue: string): boolean => {
		return (
			overflowValue === "auto" ||
			overflowValue === "scroll" ||
			overflowValue === "overlay"
		)
	}

	/**
	 * Check if an element has CSS line-clamp applied.
	 */
	const isLineClamped = (el: HTMLElement): boolean => {
		const style = window.getComputedStyle(el)
		const raw =
			style.getPropertyValue("-webkit-line-clamp") ||
			style.getPropertyValue("line-clamp")
		const value = raw.trim()
		if (value.length === 0 || value === "none") return false
		const parsed = Number.parseFloat(value)
		return Number.isFinite(parsed) ? parsed > 0 : true
	}

	/**
	 * Get the padding box size (border-box minus borders).
	 */
	const getPaddingBoxSize = (el: HTMLElement): PaddingBoxSize => {
		const rect = el.getBoundingClientRect()
		const style = window.getComputedStyle(el)
		const borderTop = parsePx(style.borderTopWidth)
		const borderRight = parsePx(style.borderRightWidth)
		const borderBottom = parsePx(style.borderBottomWidth)
		const borderLeft = parsePx(style.borderLeftWidth)

		return {
			width: Math.max(0, rect.width - borderLeft - borderRight),
			height: Math.max(0, rect.height - borderTop - borderBottom),
		}
	}

	/**
	 * Get the padding box rect (border-box minus borders) in viewport coordinates.
	 */
	const getPaddingBoxRect = (el: HTMLElement): PaddingBoxRect => {
		const rect = el.getBoundingClientRect()
		const style = window.getComputedStyle(el)
		const borderTop = parsePx(style.borderTopWidth)
		const borderRight = parsePx(style.borderRightWidth)
		const borderBottom = parsePx(style.borderBottomWidth)
		const borderLeft = parsePx(style.borderLeftWidth)

		return {
			top: rect.top + borderTop,
			right: rect.right - borderRight,
			bottom: rect.bottom - borderBottom,
			left: rect.left + borderLeft,
		}
	}

	/**
	 * Calculate overflow amounts of content rect relative to container rect.
	 * Returns null if no overflow exceeds the threshold.
	 */
	const getOverflow = (
		containerRect: DOMRect,
		contentRect: DOMRect,
		threshold = 0,
	): OverflowBox | null => {
		const top = Math.max(0, containerRect.top - contentRect.top)
		const right = Math.max(0, contentRect.right - containerRect.right)
		const bottom = Math.max(0, contentRect.bottom - containerRect.bottom)
		const left = Math.max(0, containerRect.left - contentRect.left)

		const hasOverflow =
			top > threshold ||
			right > threshold ||
			bottom > threshold ||
			left > threshold

		return hasOverflow ? { top, right, bottom, left } : null
	}

	/**
	 * Format overflow amounts to a human-readable string.
	 */
	const formatOverflow = (overflow: OverflowBox, threshold = 0): string => {
		const parts: string[] = []

		if (overflow.top > threshold) {
			parts.push(`${Math.round(overflow.top)}px top`)
		}
		if (overflow.right > threshold) {
			parts.push(`${Math.round(overflow.right)}px right`)
		}
		if (overflow.bottom > threshold) {
			parts.push(`${Math.round(overflow.bottom)}px bottom`)
		}
		if (overflow.left > threshold) {
			parts.push(`${Math.round(overflow.left)}px left`)
		}

		return parts.join(", ")
	}

	/**
	 * Check if an element has any negative margins.
	 */
	const hasNegativeMargin = (el: HTMLElement): boolean => {
		const style = window.getComputedStyle(el)
		const margins = [
			parsePx(style.marginTop),
			parsePx(style.marginRight),
			parsePx(style.marginBottom),
			parsePx(style.marginLeft),
		]
		return margins.some((m) => m < 0)
	}

	/**
	 * Check if an element is a layout container (flex, grid, or has explicit sizing).
	 */
	const isLayoutContainer = (el: HTMLElement): boolean => {
		const style = window.getComputedStyle(el)

		// Flex or grid containers are intentional layout containers
		if (style.display === "flex" || style.display === "inline-flex") {
			return true
		}
		if (style.display === "grid" || style.display === "inline-grid") {
			return true
		}

		// Check for explicit max-width constraints
		if (style.maxWidth !== "none") {
			return true
		}

		// Check for explicit height constraints (more reliable than width)
		const height = style.height
		if (
			height &&
			height !== "auto" &&
			!height.includes("%") &&
			parsePx(height) > 0
		) {
			return true
		}

		return false
	}

	/**
	 * Check if an element is positioned offscreen (e.g., skip links pattern).
	 */
	const isOffscreenPositioned = (el: HTMLElement): boolean => {
		const style = window.getComputedStyle(el)
		if (style.position !== "absolute" && style.position !== "fixed") {
			return false
		}

		const top = parseFloat(style.top)
		const left = parseFloat(style.left)

		if (!Number.isNaN(top) && top <= -500) return true
		if (!Number.isNaN(left) && left <= -500) return true

		return false
	}

	/**
	 * Get the intersection rectangle of two rects, or null if they don't intersect.
	 */
	const getIntersectionRect = (
		rectA: DOMRect,
		rectB: DOMRect,
	): DOMRect | null => {
		const left = Math.max(rectA.left, rectB.left)
		const top = Math.max(rectA.top, rectB.top)
		const right = Math.min(rectA.right, rectB.right)
		const bottom = Math.min(rectA.bottom, rectB.bottom)

		if (left >= right || top >= bottom) {
			return null
		}

		return new DOMRect(left, top, right - left, bottom - top)
	}

	/**
	 * Get the area of intersection between two rects.
	 */
	const getIntersectionArea = (rectA: DOMRect, rectB: DOMRect): number => {
		const intersection = getIntersectionRect(rectA, rectB)
		return intersection ? intersection.width * intersection.height : 0
	}

	return {
		// Type guards
		isHtmlElement,
		isSVGElement,
		isRenderableElement,
		isTextNode,

		// Visibility
		isVisible,
		isVisibleInViewport,

		// CSS parsing
		parsePx,
		getFontSize,

		// Overflow and clipping
		isClippingOverflowValue,
		canScroll,
		hasTextOverflowEllipsis,
		isLineClamped,
		isIntentionallyClipped,
		findIntentionallyClippedAncestor,
		isElementClippedBy,

		// Size and rect
		hasRectSize,
		hasElementRectSize,
		hasClientSize,
		getPaddingBoxSize,
		getPaddingBoxRect,

		// Text nodes
		getDirectTextNodes,
		getTextNodeRects,
		getTextNodeBounds,
		getTextRects,
		getTextBounds,

		// Overflow calculation
		getOverflow,
		formatOverflow,
		hasNegativeMargin,

		// Layout detection
		isLayoutContainer,
		isOffscreenPositioned,

		// Rect intersection
		getIntersectionRect,
		getIntersectionArea,
	}
}
