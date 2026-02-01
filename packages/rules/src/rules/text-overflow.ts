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
				const HORIZONTAL_OVERFLOW_THRESHOLD = 1
				const VERTICAL_OVERFLOW_RATIO = 0.5

				/**
				 * Check if overflow exceeds thresholds (different for horizontal/vertical).
				 */
				const hasSignificantOverflow = (
					overflow: {
						top: number
						right: number
						bottom: number
						left: number
					},
					verticalThreshold: number,
				): boolean => {
					return (
						overflow.top > verticalThreshold ||
						overflow.right > HORIZONTAL_OVERFLOW_THRESHOLD ||
						overflow.bottom > verticalThreshold ||
						overflow.left > HORIZONTAL_OVERFLOW_THRESHOLD
					)
				}

				/**
				 * Format overflow with separate horizontal/vertical thresholds.
				 */
				const formatOverflowWithThresholds = (
					overflow: {
						top: number
						right: number
						bottom: number
						left: number
					},
					verticalThreshold: number,
				): string => {
					const parts: string[] = []

					if (overflow.top > verticalThreshold) {
						parts.push(`${Math.round(overflow.top)}px top`)
					}
					if (overflow.right > HORIZONTAL_OVERFLOW_THRESHOLD) {
						parts.push(`${Math.round(overflow.right)}px right`)
					}
					if (overflow.bottom > verticalThreshold) {
						parts.push(`${Math.round(overflow.bottom)}px bottom`)
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
					if (!domHelpers.hasElementRectSize(el)) continue
					if (domHelpers.hasTextOverflowEllipsis(el)) continue

					const containerRect = el.getBoundingClientRect()
					const textNodes = domHelpers.getDirectTextNodes(el)

					for (const textNode of textNodes) {
						const textRect = domHelpers.getTextNodeBounds(textNode)
						if (!textRect) continue

						const fontSize = domHelpers.getFontSize(el)
						const verticalThreshold = fontSize * VERTICAL_OVERFLOW_RATIO

						// Use domHelpers.getOverflow with threshold=0 to get all overflow values,
						// then apply our custom threshold logic for horizontal vs vertical
						const overflow = domHelpers.getOverflow(containerRect, textRect, 0)
						if (!overflow) continue
						if (!hasSignificantOverflow(overflow, verticalThreshold)) continue

						const textPreview =
							(textNode.textContent || "").trim().slice(0, 30) +
							((textNode.textContent || "").length > 30 ? "..." : "")

						report({
							message: `Text "${textPreview}" overflows container by ${formatOverflowWithThresholds(
								overflow,
								verticalThreshold,
							)}`,
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
