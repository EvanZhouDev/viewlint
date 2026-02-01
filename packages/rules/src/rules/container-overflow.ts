import { defineRule } from "viewlint/plugin"
import type { OverflowBox } from "../utils/domHelpers.js"
import { getDomHelpersHandle } from "../utils/getDomHelpersHandle.js"

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
		const domHelpers = await getDomHelpersHandle(context.page)
		await context.evaluate(
			({ report, scope, args: { domHelpers } }) => {
				void report
				// Small overflow for containers that clip
				const OVERFLOW_THRESHOLD = 1
				// Larger threshold for visible overflow containers (likely intentional small overlaps)
				const VISIBLE_OVERFLOW_THRESHOLD = 20
				const NEGATIVE_MARGIN_TOLERANCE = 2

				const hasVisibleOverflow = (el: HTMLElement): boolean => {
					const style = window.getComputedStyle(el)
					return (
						style.overflow === "visible" &&
						style.overflowX === "visible" &&
						style.overflowY === "visible"
					)
				}

				const isSymmetricHorizontalOverflow = (
					overflow: { left: number; right: number },
					threshold: number,
				): boolean => {
					return (
						overflow.left > threshold &&
						overflow.right > threshold &&
						Math.abs(overflow.left - overflow.right) <= 2
					)
				}

				const looksLikeNegativeMarginClipping = (
					child: HTMLElement,
					parent: HTMLElement,
					overflow: OverflowBox,
					threshold: number,
				): boolean => {
					const parentStyle = window.getComputedStyle(parent)
					const clipsX = domHelpers.isClippingOverflowValue(
						parentStyle.overflowX,
					)
					const clipsY = domHelpers.isClippingOverflowValue(
						parentStyle.overflowY,
					)
					if (!clipsX && !clipsY) return false

					const style = window.getComputedStyle(child)
					const marginLeft = domHelpers.parsePx(style.marginLeft)
					const marginRight = domHelpers.parsePx(style.marginRight)
					const marginTop = domHelpers.parsePx(style.marginTop)
					const marginBottom = domHelpers.parsePx(style.marginBottom)

					const leftMatch =
						clipsX &&
						marginLeft < 0 &&
						overflow.left > threshold &&
						Math.abs(overflow.left - Math.abs(marginLeft)) <=
							NEGATIVE_MARGIN_TOLERANCE

					const rightMatch =
						clipsX &&
						marginRight < 0 &&
						overflow.right > threshold &&
						Math.abs(overflow.right - Math.abs(marginRight)) <=
							NEGATIVE_MARGIN_TOLERANCE

					const topMatch =
						clipsY &&
						marginTop < 0 &&
						overflow.top > threshold &&
						Math.abs(overflow.top - Math.abs(marginTop)) <=
							NEGATIVE_MARGIN_TOLERANCE

					const bottomMatch =
						clipsY &&
						marginBottom < 0 &&
						overflow.bottom > threshold &&
						Math.abs(overflow.bottom - Math.abs(marginBottom)) <=
							NEGATIVE_MARGIN_TOLERANCE

					const symmetricMatch =
						clipsX &&
						marginLeft < 0 &&
						marginRight < 0 &&
						isSymmetricHorizontalOverflow(
							{ left: overflow.left, right: overflow.right },
							threshold,
						) &&
						Math.abs(Math.abs(marginLeft) - Math.abs(marginRight)) <=
							NEGATIVE_MARGIN_TOLERANCE

					return (
						leftMatch || rightMatch || topMatch || bottomMatch || symmetricMatch
					)
				}

				const isClippedByIntentionallyClippedAncestor = (
					el: HTMLElement,
					childRect: DOMRect,
					overflow: OverflowBox,
					threshold: number,
				): boolean => {
					const needsX = overflow.left > threshold || overflow.right > threshold
					const needsY = overflow.top > threshold || overflow.bottom > threshold
					if (!needsX && !needsY) return false

					let current: Element | null = el.parentElement
					while (current) {
						if (!domHelpers.isHtmlElement(current)) {
							current = current.parentElement
							continue
						}

						const style = window.getComputedStyle(current)
						const clipsX = domHelpers.isClippingOverflowValue(style.overflowX)
						const clipsY = domHelpers.isClippingOverflowValue(style.overflowY)
						const clipsInNeededAxis = (needsX && clipsX) || (needsY && clipsY)
						if (!clipsInNeededAxis) {
							current = current.parentElement
							continue
						}
						if (!domHelpers.isIntentionallyClipped(current)) {
							current = current.parentElement
							continue
						}

						const rect = current.getBoundingClientRect()

						const clippedInX =
							needsX &&
							clipsX &&
							(childRect.left < rect.left - threshold ||
								childRect.right > rect.right + threshold)
						const clippedInY =
							needsY &&
							clipsY &&
							(childRect.top < rect.top - threshold ||
								childRect.bottom > rect.bottom + threshold)

						if (clippedInX || clippedInY) return true
						current = current.parentElement
					}

					return false
				}

				const allElements = scope.queryAll("*")

				for (const el of allElements) {
					if (!domHelpers.isHtmlElement(el)) continue
					if (!domHelpers.isVisible(el)) continue
					if (!domHelpers.hasElementRectSize(el)) continue
					if (domHelpers.hasTextOverflowEllipsis(el)) continue
					if (domHelpers.isOffscreenPositioned(el)) continue

					const elementStyle = window.getComputedStyle(el)
					if (
						elementStyle.position === "absolute" ||
						elementStyle.position === "fixed" ||
						elementStyle.position === "sticky"
					) {
						continue
					}

					const parent = el.parentElement
					if (!parent || !domHelpers.isHtmlElement(parent)) continue
					if (!domHelpers.isVisible(parent)) continue
					if (!domHelpers.hasElementRectSize(parent)) continue

					// Skip body as parent - content overflowing body is normal for scrollable pages
					if (parent.tagName === "BODY" || parent.tagName === "HTML") continue

					if (domHelpers.hasTextOverflowEllipsis(parent)) continue
					if (domHelpers.isIntentionallyClipped(parent)) continue

					const parentRect = parent.getBoundingClientRect()
					const childRect = el.getBoundingClientRect()
					const parentHasVisibleOverflow = hasVisibleOverflow(parent)

					// For visible overflow containers, use higher threshold and only
					// check if parent looks like a proper layout container
					if (parentHasVisibleOverflow) {
						if (!domHelpers.isLayoutContainer(parent)) continue

						const overflow = domHelpers.getOverflow(
							parentRect,
							childRect,
							VISIBLE_OVERFLOW_THRESHOLD,
						)
						if (!overflow) continue

						if (
							isClippedByIntentionallyClippedAncestor(
								el,
								childRect,
								overflow,
								VISIBLE_OVERFLOW_THRESHOLD,
							)
						) {
							continue
						}

						report({
							message: `Element overflows its container by ${domHelpers.formatOverflow(overflow, VISIBLE_OVERFLOW_THRESHOLD)}`,
							element: el,
							relations: [{ description: "Container", element: parent }],
						})
					} else {
						const overflow = domHelpers.getOverflow(
							parentRect,
							childRect,
							OVERFLOW_THRESHOLD,
						)
						if (!overflow) continue

						if (
							looksLikeNegativeMarginClipping(
								el,
								parent,
								overflow,
								OVERFLOW_THRESHOLD,
							)
						) {
							continue
						}

						if (
							isClippedByIntentionallyClippedAncestor(
								el,
								childRect,
								overflow,
								OVERFLOW_THRESHOLD,
							)
						) {
							continue
						}

						report({
							message: `Element overflows its container by ${domHelpers.formatOverflow(overflow, OVERFLOW_THRESHOLD)}`,
							element: el,
							relations: [{ description: "Container", element: parent }],
						})
					}
				}
			},
			{ domHelpers },
		)
	},
})
