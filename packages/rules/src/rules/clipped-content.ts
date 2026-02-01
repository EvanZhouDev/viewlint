import { defineRule } from "viewlint/plugin"
import { getDomHelpersHandle } from "../utils/getDomHelpersHandle.js"

/**
 * Detects elements with overflow:hidden or overflow:clip that are clipping content.
 *
 * Uses scrollWidth/scrollHeight as a signal for overflow, but compares against
 * the element's (subpixel) padding box size derived from getBoundingClientRect
 * to avoid false positives caused by integer rounding of clientWidth/clientHeight.
 */
export default defineRule({
	meta: {
		severity: "error",
		docs: {
			description:
				"Detects content clipped by overflow:hidden or overflow:clip",
			recommended: true,
		},
	},

	async run(context) {
		const domHelpers = await getDomHelpersHandle(context.page)

		await context.evaluate(
			({ report, scope, args: { domHelpers } }) => {
				const CLIP_THRESHOLD = 1
				const MIN_TEXT_CLIP_THRESHOLD = 3
				const NEGATIVE_MARGIN_TOLERANCE = 2

				const hasObviousMediaDescendant = (el: HTMLElement): boolean => {
					return Boolean(el.querySelector("img, video, canvas, svg, picture"))
				}

				const hasPseudoContent = (el: HTMLElement): boolean => {
					const before = window.getComputedStyle(el, "::before").content
					const after = window.getComputedStyle(el, "::after").content
					return (
						(before !== "none" && before !== "normal") ||
						(after !== "none" && after !== "normal")
					)
				}

				const matchesNegativeMarginClipping = (
					container: HTMLElement,
					axis: "x" | "y",
					clippedAmount: number,
				): boolean => {
					if (container.children.length === 0) return false
					if (domHelpers.getDirectTextNodes(container, 1).length > 0)
						return false

					const children = Array.from(container.children).slice(0, 25)
					for (const child of children) {
						if (!domHelpers.isHtmlElement(child)) continue
						if (!domHelpers.isVisible(child)) continue

						const style = window.getComputedStyle(child)
						const first =
							axis === "x"
								? domHelpers.parsePx(style.marginLeft)
								: domHelpers.parsePx(style.marginTop)
						const second =
							axis === "x"
								? domHelpers.parsePx(style.marginRight)
								: domHelpers.parsePx(style.marginBottom)

						if (first >= 0 && second >= 0) continue

						const expected = Math.max(0, -first) + Math.max(0, -second)
						if (expected <= 0) continue

						const closeEnough =
							Math.abs(clippedAmount - expected) <= NEGATIVE_MARGIN_TOLERANCE
						const likelyFromNegativeMargins =
							clippedAmount <= expected + NEGATIVE_MARGIN_TOLERANCE

						if (closeEnough || likelyFromNegativeMargins) return true
					}

					return false
				}

				const allElements = scope.queryAll("*")

				for (const el of allElements) {
					if (!domHelpers.isHtmlElement(el)) continue
					if (!domHelpers.isVisible(el)) continue
					if (!domHelpers.hasClientSize(el)) continue

					const parent = el.parentElement
					if (
						parent &&
						domHelpers.isHtmlElement(parent) &&
						domHelpers.isIntentionallyClipped(parent)
					) {
						continue
					}

					const style = window.getComputedStyle(el)
					const overflowX = style.overflowX
					const overflowY = style.overflowY

					const clipsX = domHelpers.isClippingOverflowValue(overflowX)
					const clipsY = domHelpers.isClippingOverflowValue(overflowY)
					const clampsTextVertically = domHelpers.isLineClamped(el)
					const clipsYForCheck = clipsY && !clampsTextVertically

					if (!clipsX && !clipsY) continue
					if (clipsX && domHelpers.hasTextOverflowEllipsis(el)) continue

					const { scrollWidth, scrollHeight } = el
					const paddingBox = domHelpers.getPaddingBoxSize(el)

					const clippedAmountX = scrollWidth - paddingBox.width
					const clippedAmountY = scrollHeight - paddingBox.height

					let clippedX = clipsX && clippedAmountX > CLIP_THRESHOLD
					let clippedY = clipsYForCheck && clippedAmountY > CLIP_THRESHOLD

					if (clippedY) {
						const hasVisibleText = el.innerText.trim().length > 0
						const fontSizePx = domHelpers.getFontSize(el)
						const textClipThreshold = hasVisibleText
							? Math.max(MIN_TEXT_CLIP_THRESHOLD, fontSizePx * 0.2)
							: CLIP_THRESHOLD

						clippedY = clippedAmountY > textClipThreshold
					}

					if (clippedY) {
						const isLikelyMinorCrop =
							paddingBox.height >= 48 &&
							domHelpers.isIntentionallyClipped(el) &&
							hasObviousMediaDescendant(el)

						if (isLikelyMinorCrop) {
							const allowable = Math.max(4, paddingBox.height * 0.02)
							if (clippedAmountY <= allowable) {
								clippedY = false
							}
						}
					}

					if (clippedX || clippedY) {
						const hasVisibleText = el.innerText.trim().length > 0
						const hasDirectText =
							domHelpers.getDirectTextNodes(el, 1).length > 0

						const canVerifyByChildRects =
							!hasVisibleText &&
							!hasDirectText &&
							!hasPseudoContent(el) &&
							el.children.length > 0 &&
							el.children.length <= 5

						if (canVerifyByChildRects) {
							const clipRect = domHelpers.getPaddingBoxRect(el)
							let fitsX = true
							let fitsY = true

							for (const child of el.children) {
								if (!domHelpers.isHtmlElement(child)) continue
								if (!domHelpers.isVisible(child)) continue
								const r = child.getBoundingClientRect()
								if (r.width === 0 || r.height === 0) continue

								if (r.left < clipRect.left - CLIP_THRESHOLD) fitsX = false
								if (r.right > clipRect.right + CLIP_THRESHOLD) fitsX = false
								if (r.top < clipRect.top - CLIP_THRESHOLD) fitsY = false
								if (r.bottom > clipRect.bottom + CLIP_THRESHOLD) fitsY = false

								if (!fitsX && !fitsY) break
							}

							if (clippedX && fitsX) clippedX = false
							if (clippedY && fitsY) clippedY = false
						}
					}

					if (
						clippedX &&
						matchesNegativeMarginClipping(el, "x", clippedAmountX)
					) {
						clippedX = false
					}

					if (
						clippedY &&
						matchesNegativeMarginClipping(el, "y", clippedAmountY)
					) {
						clippedY = false
					}

					// Common layout pattern: horizontal gutters achieved by clipping symmetric overflow.
					if (clippedX) {
						let minLeft = Infinity
						let maxRight = -Infinity

						const clipRect = el.getBoundingClientRect()

						for (const child of el.children) {
							if (!domHelpers.isHtmlElement(child)) continue
							if (!domHelpers.isVisible(child)) continue
							const r = child.getBoundingClientRect()
							minLeft = Math.min(minLeft, r.left)
							maxRight = Math.max(maxRight, r.right)
						}

						if (minLeft !== Infinity && maxRight !== -Infinity) {
							const leftOverflow = Math.max(0, clipRect.left - minLeft)
							const rightOverflow = Math.max(0, maxRight - clipRect.right)
							const isSymmetric =
								leftOverflow > CLIP_THRESHOLD &&
								rightOverflow > CLIP_THRESHOLD &&
								Math.abs(leftOverflow - rightOverflow) <= 2

							if (isSymmetric) {
								clippedX = false
							}
						}
					}

					if (!clippedX && !clippedY) continue

					const containerRect = el.getBoundingClientRect()
					let absoluteChildOverflow = false

					for (const child of el.children) {
						if (!domHelpers.isHtmlElement(child)) continue
						const childStyle = window.getComputedStyle(child)
						if (childStyle.position !== "absolute") continue

						const childRect = child.getBoundingClientRect()
						const overflowsX =
							childRect.right - containerRect.right > CLIP_THRESHOLD ||
							containerRect.left - childRect.left > CLIP_THRESHOLD
						const overflowsY =
							childRect.bottom - containerRect.bottom > CLIP_THRESHOLD ||
							containerRect.top - childRect.top > CLIP_THRESHOLD

						if ((clippedX && overflowsX) || (clippedY && overflowsY)) {
							absoluteChildOverflow = true
							break
						}
					}

					if (absoluteChildOverflow) continue

					let message: string
					if (clippedX && clippedY) {
						message = `Content is clipped by ${Math.round(clippedAmountX)}px horizontally and ${Math.round(clippedAmountY)}px vertically`
					} else if (clippedX) {
						message = `Content is clipped by ${Math.round(clippedAmountX)}px horizontally`
					} else {
						message = `Content is clipped by ${Math.round(clippedAmountY)}px vertically`
					}

					report({
						message,
						element: el,
					})
				}
			},
			{ domHelpers },
		)
	},
})
