import { defineRule } from "viewlint/plugin"

/**
 * Detects text that extends beyond its container element's bounds.
 *
 * Uses Range API to measure text node bounds and compares against
 * the container element's bounding box.
 */
export default defineRule({
	meta: {
		severity: "error",
		docs: {
			description: "Detects text that overflows its container element",
			recommended: true,
		},
	},

	async run(context) {
		await context.evaluate(({ report }) => {
			const OVERFLOW_THRESHOLD = 1

			const isHTMLElement = (el: Element | null): el is HTMLElement => {
				return el instanceof HTMLElement
			}

			const isVisible = (el: HTMLElement): boolean => {
				const style = window.getComputedStyle(el)

				if (style.display === "none") return false
				if (style.visibility === "hidden" || style.visibility === "collapse")
					return false

				return true
			}

			const hasSize = (el: HTMLElement): boolean => {
				const rect = el.getBoundingClientRect()
				return rect.width > 0 && rect.height > 0
			}

			const hasTextOverflowEllipsis = (el: HTMLElement): boolean => {
				const style = window.getComputedStyle(el)
				return style.textOverflow === "ellipsis"
			}

			const getTextNodeBounds = (textNode: Text): DOMRect | null => {
				const text = textNode.textContent
				if (!text || text.trim().length === 0) return null

				const range = document.createRange()
				range.selectNodeContents(textNode)

				const rects = range.getClientRects()
				if (rects.length === 0) return null

				let left = Infinity
				let top = Infinity
				let right = -Infinity
				let bottom = -Infinity

				for (const rect of rects) {
					if (rect.width === 0 && rect.height === 0) continue
					left = Math.min(left, rect.left)
					top = Math.min(top, rect.top)
					right = Math.max(right, rect.right)
					bottom = Math.max(bottom, rect.bottom)
				}

				if (left === Infinity) return null

				return new DOMRect(left, top, right - left, bottom - top)
			}

			const getOverflow = (
				containerRect: DOMRect,
				textRect: DOMRect,
			): {
				top: number
				right: number
				bottom: number
				left: number
			} | null => {
				const top = Math.max(0, containerRect.top - textRect.top)
				const right = Math.max(0, textRect.right - containerRect.right)
				const bottom = Math.max(0, textRect.bottom - containerRect.bottom)
				const left = Math.max(0, containerRect.left - textRect.left)

				const hasOverflow =
					top > OVERFLOW_THRESHOLD ||
					right > OVERFLOW_THRESHOLD ||
					bottom > OVERFLOW_THRESHOLD ||
					left > OVERFLOW_THRESHOLD

				return hasOverflow ? { top, right, bottom, left } : null
			}

			const formatOverflow = (overflow: {
				top: number
				right: number
				bottom: number
				left: number
			}): string => {
				const parts: string[] = []

				if (overflow.top > OVERFLOW_THRESHOLD) {
					parts.push(`${Math.round(overflow.top)}px top`)
				}
				if (overflow.right > OVERFLOW_THRESHOLD) {
					parts.push(`${Math.round(overflow.right)}px right`)
				}
				if (overflow.bottom > OVERFLOW_THRESHOLD) {
					parts.push(`${Math.round(overflow.bottom)}px bottom`)
				}
				if (overflow.left > OVERFLOW_THRESHOLD) {
					parts.push(`${Math.round(overflow.left)}px left`)
				}

				return parts.join(", ")
			}

			const allElements = document.querySelectorAll("*")

			for (const el of allElements) {
				if (!isHTMLElement(el)) continue
				if (!isVisible(el)) continue
				if (!hasSize(el)) continue

				if (hasTextOverflowEllipsis(el)) continue

				const containerRect = el.getBoundingClientRect()

				const textNodes: Text[] = []
				const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
					acceptNode(node) {
						if (node.parentElement === el) {
							return NodeFilter.FILTER_ACCEPT
						}
						return NodeFilter.FILTER_SKIP
					},
				})

				let node = walker.nextNode()
				while (node) {
					if (node instanceof Text) {
						textNodes.push(node)
					}
					node = walker.nextNode()
				}

				for (const textNode of textNodes) {
					const textRect = getTextNodeBounds(textNode)
					if (!textRect) continue

					const overflow = getOverflow(containerRect, textRect)
					if (!overflow) continue

					const textPreview =
						(textNode.textContent || "").trim().slice(0, 30) +
						((textNode.textContent || "").length > 30 ? "..." : "")

					report({
						message: `Text "${textPreview}" overflows container by ${formatOverflow(overflow)}`,
						element: el,
					})

					break
				}
			}
		})
	},
})
