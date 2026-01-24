import { defineRule } from "viewlint/plugin"
import { getDomHelpersHandle } from "../utils/getDomHelpersHandle.js"

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
		const domHelpers = await getDomHelpersHandle(context.page)
		await context.evaluate(
			({ report, scope, args: { domHelpers } }) => {
				const HORIZONTAL_OVERFLOW_THRESHOLD = 0

				const hasSize = (el: HTMLElement): boolean => {
					return domHelpers.hasElementRectSize(el)
				}

				const hasTextOverflowEllipsis = (el: HTMLElement): boolean => {
					const style = window.getComputedStyle(el)
					return style.textOverflow === "ellipsis"
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
						right > HORIZONTAL_OVERFLOW_THRESHOLD ||
						left > HORIZONTAL_OVERFLOW_THRESHOLD

					return hasOverflow ? { top, right, bottom, left } : null
				}

				const formatOverflow = (overflow: {
					top: number
					right: number
					bottom: number
					left: number
				}): string => {
					const parts: string[] = []

					if (overflow.right > HORIZONTAL_OVERFLOW_THRESHOLD) {
						parts.push(`${Math.round(overflow.right)}px right`)
					}
					if (overflow.left > HORIZONTAL_OVERFLOW_THRESHOLD) {
						parts.push(`${Math.round(overflow.left)}px left`)
					}

					return parts.join(", ")
				}

				const allElements = scope.queryAll("*")

				for (const el of allElements) {
					if (!domHelpers.isHtmlElement(el)) continue
					if (!domHelpers.isVisible(el)) continue
					if (!hasSize(el)) continue

					if (hasTextOverflowEllipsis(el)) continue

					const containerRect = el.getBoundingClientRect()

					const textNodes = domHelpers.getDirectTextNodes(el)

					for (const textNode of textNodes) {
						const textRect = domHelpers.getTextNodeBounds(textNode)
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
			},
			{ domHelpers },
		)
	},
})
