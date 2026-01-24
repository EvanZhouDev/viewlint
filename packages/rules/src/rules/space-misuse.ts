import { defineRule } from "viewlint/plugin"
import { getDomHelpersHandle } from "../utils/getDomHelpersHandle.js"

/**
 * Detects containers with irregular spacing around their content.
 *
 * Checks containers with a single content block and reports when the
 * empty space around the content is severely asymmetric, indicating
 * potential layout issues or unintentional spacing.
 *
 * Only reports on "leaf-like" containers where the spacing issue is
 * clearly within that element, not explained by sibling layout.
 */
export default defineRule({
	meta: {
		severity: "warn",
		docs: {
			description:
				"Detects containers with irregularly distributed empty space around content",
			recommended: false,
		},
	},

	async run(context) {
		const domHelpers = await getDomHelpersHandle(context.page)
		await context.evaluate(
			({ report, scope, args: { domHelpers } }) => {
				void report
				const MIN_CONTAINER_SIZE = 50
				// For asymmetric spacing detection
				const IRREGULARITY_RATIO = 6
				const MIN_GAP_DIFFERENCE = 40
				const MIN_LARGE_GAP = 60
				// For excessive padding detection (content fills less than this % of container)
				const LOW_FILL_THRESHOLD = 0.25
				const MIN_WASTED_SPACE = 100
				// Leaf-like container heuristics
				const MAX_SIMPLE_CHILDREN = 3
				const MAX_SIMPLE_AREA_RATIO = 0.3

				const hasMinSize = (rect: DOMRect, minSize: number): boolean => {
					return rect.width >= minSize && rect.height >= minSize
				}

				/**
				 * Gets the union bounding box of all direct children.
				 * Returns null if there are no visible children.
				 */
				const getDirectChildrenBounds = (
					container: HTMLElement,
				): DOMRect | null => {
					let minLeft = Infinity
					let minTop = Infinity
					let maxRight = -Infinity
					let maxBottom = -Infinity
					let hasContent = false

					for (const child of container.children) {
						if (!domHelpers.isRenderableElement(child)) continue
						if (!domHelpers.isVisible(child)) continue

						const rect = child.getBoundingClientRect()
						if (rect.width === 0 && rect.height === 0) continue

						hasContent = true
						minLeft = Math.min(minLeft, rect.left)
						minTop = Math.min(minTop, rect.top)
						maxRight = Math.max(maxRight, rect.right)
						maxBottom = Math.max(maxBottom, rect.bottom)
					}

					if (!hasContent) return null

					return new DOMRect(
						minLeft,
						minTop,
						maxRight - minLeft,
						maxBottom - minTop,
					)
				}

				/**
				 * Checks if the container is a "leaf-like" container suitable for analysis.
				 * Only containers with a single visible child are checked, as multi-child
				 * containers usually have intentional layout structure.
				 */
				const isLeafContainer = (el: HTMLElement): boolean => {
					const style = window.getComputedStyle(el)

					if (style.display === "grid") {
						return false
					}

					const containerRect = el.getBoundingClientRect()
					if (containerRect.width === 0 || containerRect.height === 0) {
						return false
					}

					let visibleChildCount = 0
					let maxChildAreaRatio = 0
					let totalChildArea = 0
					const containerArea = containerRect.width * containerRect.height
					for (const child of el.children) {
						if (!domHelpers.isRenderableElement(child)) continue
						if (!domHelpers.isVisible(child)) continue

						const rect = child.getBoundingClientRect()
						if (rect.width === 0 && rect.height === 0) continue

						visibleChildCount++

						const childArea = rect.width * rect.height
						totalChildArea += childArea

						if (containerArea > 0) {
							maxChildAreaRatio = Math.max(
								maxChildAreaRatio,
								childArea / containerArea,
							)
						}
					}

					if (visibleChildCount === 0) return false

					const totalChildAreaRatio =
						containerArea > 0 ? totalChildArea / containerArea : 0

					if (visibleChildCount <= MAX_SIMPLE_CHILDREN) {
						return totalChildAreaRatio < MAX_SIMPLE_AREA_RATIO
					}

					// If there's a dominant child, treat as leaf-like
					return maxChildAreaRatio >= 0.5
				}

				/**
				 * Checks if siblings in the parent container fill the gap regions.
				 * If a sibling occupies the space where we'd report a "gap", the gap isn't
				 * actually visually empty - it's intentionally reserved for the sibling.
				 */
				const isSiblingFillingGap = (
					container: HTMLElement,
					containerRect: DOMRect,
					gaps: { top: number; right: number; bottom: number; left: number },
				): { top: boolean; right: boolean; bottom: boolean; left: boolean } => {
					const filled = {
						top: false,
						right: false,
						bottom: false,
						left: false,
					}
					const parent = container.parentElement
					if (!parent) return filled

					// Check each sibling
					for (const sibling of parent.children) {
						if (!domHelpers.isRenderableElement(sibling)) continue
						if (!(sibling instanceof HTMLElement)) continue
						if (sibling === container) continue
						if (!domHelpers.isVisible(sibling)) continue

						const siblingRect = sibling.getBoundingClientRect()
						if (siblingRect.width === 0 && siblingRect.height === 0) continue

						// Check if sibling fills the top gap region
						if (gaps.top > 20) {
							// Sibling is above container and overlaps horizontally
							if (
								siblingRect.bottom <= containerRect.top + 10 &&
								siblingRect.bottom >= containerRect.top - gaps.top &&
								siblingRect.left < containerRect.right &&
								siblingRect.right > containerRect.left
							) {
								filled.top = true
							}
						}

						// Check if sibling fills the bottom gap region
						if (gaps.bottom > 20) {
							if (
								siblingRect.top >= containerRect.bottom - 10 &&
								siblingRect.top <= containerRect.bottom + gaps.bottom &&
								siblingRect.left < containerRect.right &&
								siblingRect.right > containerRect.left
							) {
								filled.bottom = true
							}
						}

						// Check if sibling fills the left gap region
						if (gaps.left > 20) {
							if (
								siblingRect.right <= containerRect.left + 10 &&
								siblingRect.right >= containerRect.left - gaps.left &&
								siblingRect.top < containerRect.bottom &&
								siblingRect.bottom > containerRect.top
							) {
								filled.left = true
							}
						}

						// Check if sibling fills the right gap region
						if (gaps.right > 20) {
							if (
								siblingRect.left >= containerRect.right - 10 &&
								siblingRect.left <= containerRect.right + gaps.right &&
								siblingRect.top < containerRect.bottom &&
								siblingRect.bottom > containerRect.top
							) {
								filled.right = true
							}
						}
					}

					return filled
				}

				const analyzeSpacing = (
					container: HTMLElement,
					containerRect: DOMRect,
					contentRect: DOMRect,
				): { message: string } | null => {
					const contentFillRatioH = contentRect.width / containerRect.width
					const contentFillRatioV = contentRect.height / containerRect.height

					// Skip if content is very small relative to container in BOTH dimensions
					// (might be an intentional icon/badge in a large area)
					if (contentFillRatioH < 0.2 && contentFillRatioV < 0.2) {
						return null
					}

					const gaps = {
						top: contentRect.top - containerRect.top,
						right: containerRect.right - contentRect.right,
						bottom: containerRect.bottom - contentRect.bottom,
						left: contentRect.left - containerRect.left,
					}

					// Check if sibling elements fill the gap regions
					const siblingsFilling = isSiblingFillingGap(
						container,
						containerRect,
						gaps,
					)

					const checkAxisIrregularity = (
						gapA: number,
						gapB: number,
						sideA: string,
						sideB: string,
						sideAFilled: boolean,
						sideBFilled: boolean,
					): string | null => {
						const minGap = Math.min(gapA, gapB)
						const maxGap = Math.max(gapA, gapB)

						if (maxGap < MIN_LARGE_GAP) return null
						if (maxGap - minGap < MIN_GAP_DIFFERENCE) return null

						// Determine which side has the large gap
						const largeGapSide = gapA > gapB ? sideA : sideB
						const largeGapFilled = gapA > gapB ? sideAFilled : sideBFilled

						// If the large gap is filled by a sibling, it's intentional layout
						if (largeGapFilled) return null

						if (minGap <= 2 && maxGap >= MIN_LARGE_GAP) {
							const side = gapA <= 2 ? sideA : sideB
							const oppositeSide = gapA <= 2 ? sideB : sideA
							return `content is flush with ${side} edge, ${Math.round(maxGap)}px gap on ${oppositeSide}`
						}

						if (minGap > 0) {
							const ratio = maxGap / minGap
							if (ratio < IRREGULARITY_RATIO) return null

							const smallSide = gapA > gapB ? sideB : sideA
							return `${largeGapSide} gap (${Math.round(maxGap)}px) is ${ratio.toFixed(1)}x larger than ${smallSide} (${Math.round(minGap)}px)`
						}

						return null
					}

					/**
					 * Check for excessive padding - when content fills very little of the container
					 * and there's significant wasted space on an axis
					 */
					const checkExcessivePadding = (
						fillRatio: number,
						gapA: number,
						gapB: number,
						dimension: "horizontal" | "vertical",
					): string | null => {
						if (fillRatio >= LOW_FILL_THRESHOLD) return null

						const totalGap = gapA + gapB
						if (totalGap < MIN_WASTED_SPACE) return null

						// Only report if gaps are relatively balanced (otherwise asymmetry check catches it)
						const minGap = Math.min(gapA, gapB)
						const maxGap = Math.max(gapA, gapB)
						if (minGap > 0 && maxGap / minGap > 3) return null

						const fillPercent = Math.round(fillRatio * 100)
						return `content fills only ${fillPercent}% of ${dimension} space (${Math.round(totalGap)}px unused)`
					}

					const irregularities: string[] = []

					// Check for asymmetric spacing
					const hIrregularity = checkAxisIrregularity(
						gaps.left,
						gaps.right,
						"left",
						"right",
						siblingsFilling.left,
						siblingsFilling.right,
					)
					if (hIrregularity) irregularities.push(hIrregularity)

					const vIrregularity = checkAxisIrregularity(
						gaps.top,
						gaps.bottom,
						"top",
						"bottom",
						siblingsFilling.top,
						siblingsFilling.bottom,
					)
					if (vIrregularity) irregularities.push(vIrregularity)

					// Check for excessive padding (symmetric but wasteful)
					const hExcessive = checkExcessivePadding(
						contentFillRatioH,
						gaps.left,
						gaps.right,
						"horizontal",
					)
					if (hExcessive && !hIrregularity) irregularities.push(hExcessive)

					const vExcessive = checkExcessivePadding(
						contentFillRatioV,
						gaps.top,
						gaps.bottom,
						"vertical",
					)
					if (vExcessive && !vIrregularity) irregularities.push(vExcessive)

					if (irregularities.length === 0) return null

					return {
						message: `Irregular spacing: ${irregularities.join("; ")}`,
					}
				}

				const allElements = scope.queryAll("*")

				for (const el of allElements) {
					if (!domHelpers.isHtmlElement(el)) continue
					if (!domHelpers.isVisible(el)) continue
					if (el.children.length === 0) continue

					const containerRect = el.getBoundingClientRect()
					if (!hasMinSize(containerRect, MIN_CONTAINER_SIZE)) continue

					if (!isLeafContainer(el)) continue

					const contentRect = getDirectChildrenBounds(el)
					if (!contentRect) continue

					if (!hasMinSize(contentRect, 10)) continue

					const analysis = analyzeSpacing(el, containerRect, contentRect)
					if (!analysis) continue

					report({
						message: analysis.message,
						element: el,
					})
				}
			},
			{ domHelpers },
		)
	},
})
