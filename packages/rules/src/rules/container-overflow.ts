import { defineRule } from "viewlint/plugin"

/**
 * Detects child elements that overflow their parent container bounds.
 *
 * Compares bounding boxes of parent and child to detect when content
 * extends beyond the visible container area.
 */
export default defineRule({
	meta: {
		severity: "error",
		docs: {
			description:
				"Detects child elements that overflow their parent container",
			recommended: true,
		},
	},

	async run(context) {
		await context.evaluate(({ report }) => {
			// Small overflow for containers that clip
			const OVERFLOW_THRESHOLD = 1
			// Larger threshold for visible overflow containers (likely intentional small overlaps)
			const VISIBLE_OVERFLOW_THRESHOLD = 20

			const isHTMLElement = (el: Element | null): el is HTMLElement => {
				return el instanceof HTMLElement
			}

			const isVisible = (el: HTMLElement): boolean => {
				const style = window.getComputedStyle(el)

				if (style.display === "none") return false
				if (style.visibility === "hidden" || style.visibility === "collapse")
					return false
				if (parseFloat(style.opacity) === 0) return false

				return true
			}

			const isOffscreenPositioned = (el: HTMLElement): boolean => {
				const style = window.getComputedStyle(el)
				if (style.position !== "absolute" && style.position !== "fixed")
					return false

				const top = parseFloat(style.top)
				const left = parseFloat(style.left)

				if (!Number.isNaN(top) && top <= -500) return true
				if (!Number.isNaN(left) && left <= -500) return true

				return false
			}

			const hasVisibleOverflow = (el: HTMLElement): boolean => {
				const style = window.getComputedStyle(el)
				return (
					style.overflow === "visible" &&
					style.overflowX === "visible" &&
					style.overflowY === "visible"
				)
			}

			/**
			 * Check if an element appears to be a layout container that should
			 * contain its children (not just a wrapper div).
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

				// Elements with explicit sizing are intentional containers
				if (style.width !== "auto" && !style.width.includes("%")) {
					return true
				}
				if (style.maxWidth !== "none") {
					return true
				}

				return false
			}

			const hasSize = (el: HTMLElement): boolean => {
				const rect = el.getBoundingClientRect()
				return rect.width > 0 && rect.height > 0
			}

			const getOverflow = (
				parentRect: DOMRect,
				childRect: DOMRect,
				threshold: number,
			): {
				top: number
				right: number
				bottom: number
				left: number
			} | null => {
				const top = Math.max(0, parentRect.top - childRect.top)
				const right = Math.max(0, childRect.right - parentRect.right)
				const bottom = Math.max(0, childRect.bottom - parentRect.bottom)
				const left = Math.max(0, parentRect.left - childRect.left)

				const hasOverflow =
					top > threshold ||
					right > threshold ||
					bottom > threshold ||
					left > threshold

				return hasOverflow ? { top, right, bottom, left } : null
			}

			const formatOverflow = (
				overflow: {
					top: number
					right: number
					bottom: number
					left: number
				},
				threshold: number,
			): string => {
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

			const allElements = document.querySelectorAll("*")

			for (const el of allElements) {
				if (!isHTMLElement(el)) continue
				if (!isVisible(el)) continue
				if (!hasSize(el)) continue

				// Common intentional pattern: offscreen positioned elements (e.g. skip links)
				if (isOffscreenPositioned(el)) continue

				const parent = el.parentElement
				if (!isHTMLElement(parent)) continue
				if (!isVisible(parent)) continue
				if (!hasSize(parent)) continue

				// Skip body as parent - content overflowing body is normal for scrollable pages
				if (parent.tagName === "BODY" || parent.tagName === "HTML") continue

				const parentRect = parent.getBoundingClientRect()
				const childRect = el.getBoundingClientRect()

				const parentHasVisibleOverflow = hasVisibleOverflow(parent)

				// For visible overflow containers, use higher threshold and only
				// check if parent looks like a proper layout container
				if (parentHasVisibleOverflow) {
					if (!isLayoutContainer(parent)) continue

					const overflow = getOverflow(
						parentRect,
						childRect,
						VISIBLE_OVERFLOW_THRESHOLD,
					)
					if (!overflow) continue

					report({
						message: `Element overflows its container by ${formatOverflow(overflow, VISIBLE_OVERFLOW_THRESHOLD)}`,
						element: el,
						relations: [
							{
								description: "Container",
								element: parent,
							},
						],
					})
				} else {
					const overflow = getOverflow(
						parentRect,
						childRect,
						OVERFLOW_THRESHOLD,
					)
					if (!overflow) continue

					report({
						message: `Element overflows its container by ${formatOverflow(overflow, OVERFLOW_THRESHOLD)}`,
						element: el,
						relations: [
							{
								description: "Container",
								element: parent,
							},
						],
					})
				}
			}
		})
	},
})
