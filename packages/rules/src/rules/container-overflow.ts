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

			const getOverflow = (
				parentRect: DOMRect,
				childRect: DOMRect,
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

				const parent = el.parentElement
				if (!isHTMLElement(parent)) continue
				if (!isVisible(parent)) continue
				if (!hasSize(parent)) continue

				const parentRect = parent.getBoundingClientRect()
				const childRect = el.getBoundingClientRect()

				const overflow = getOverflow(parentRect, childRect)
				if (!overflow) continue

				report({
					message: `Element overflows its container by ${formatOverflow(overflow)}`,
					element: el,
					relations: [
						{
							description: "Container",
							element: parent,
						},
					],
				})
			}
		})
	},
})
