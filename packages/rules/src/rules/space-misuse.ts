import { defineRule } from "viewlint/plugin"
import { getDomHelpersHandle } from "../utils/getDomHelpersHandle.js"

/**
 * Detects containers with irregular spacing around their content.
 * Reports when empty space around content is severely asymmetric.
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

				// Thresholds
				const MIN_CONTAINER_SIZE = 50,
					MIN_CONTENT_SIZE = 10
				const IRREGULARITY_RATIO = 6,
					MIN_GAP_DIFF = 40,
					MIN_LARGE_GAP = 60
				const SIBLING_GAP_THRESHOLD = 20,
					SIBLING_TOLERANCE = 10
				const LOW_FILL = 0.25,
					MIN_WASTED = 100,
					BALANCED_RATIO = 3
				const MAX_SIMPLE_CHILDREN = 3,
					MAX_SIMPLE_AREA = 0.3
				const DOMINANT_CHILD = 0.5,
					MIN_FILL = 0.2

				type Gaps = {
					top: number
					right: number
					bottom: number
					left: number
				}
				type Filled = {
					top: boolean
					right: boolean
					bottom: boolean
					left: boolean
				}

				const getChildrenBounds = (container: HTMLElement): DOMRect | null => {
					let minL = Infinity,
						minT = Infinity,
						maxR = -Infinity,
						maxB = -Infinity
					let hasContent = false
					for (const child of container.children) {
						if (
							!domHelpers.isRenderableElement(child) ||
							!domHelpers.isVisible(child)
						)
							continue
						const r = child.getBoundingClientRect()
						if (!domHelpers.hasRectSize(r)) continue
						hasContent = true
						minL = Math.min(minL, r.left)
						minT = Math.min(minT, r.top)
						maxR = Math.max(maxR, r.right)
						maxB = Math.max(maxB, r.bottom)
					}
					return hasContent
						? new DOMRect(minL, minT, maxR - minL, maxB - minT)
						: null
				}

				const isLeafContainer = (el: HTMLElement): boolean => {
					const style = window.getComputedStyle(el)
					if (style.display === "grid") return false
					const rect = el.getBoundingClientRect()
					if (!domHelpers.hasRectSize(rect)) return false

					let count = 0,
						maxRatio = 0,
						totalArea = 0
					const containerArea = rect.width * rect.height
					for (const child of el.children) {
						if (
							!domHelpers.isRenderableElement(child) ||
							!domHelpers.isVisible(child)
						)
							continue
						const r = child.getBoundingClientRect()
						if (!domHelpers.hasRectSize(r)) continue
						count++
						const area = r.width * r.height
						totalArea += area
						if (containerArea > 0)
							maxRatio = Math.max(maxRatio, area / containerArea)
					}
					if (count === 0) return false
					const totalRatio = containerArea > 0 ? totalArea / containerArea : 0
					return count <= MAX_SIMPLE_CHILDREN
						? totalRatio < MAX_SIMPLE_AREA
						: maxRatio >= DOMINANT_CHILD
				}

				const getSiblingFilled = (
					container: HTMLElement,
					cRect: DOMRect,
					gaps: Gaps,
				): Filled => {
					const filled: Filled = {
						top: false,
						right: false,
						bottom: false,
						left: false,
					}
					const parent = container.parentElement
					if (!parent) return filled

					for (const sib of parent.children) {
						if (
							!domHelpers.isRenderableElement(sib) ||
							!(sib instanceof HTMLElement)
						)
							continue
						if (sib === container || !domHelpers.isVisible(sib)) continue
						const s = sib.getBoundingClientRect()
						if (!domHelpers.hasRectSize(s)) continue

						const hOverlap = s.left < cRect.right && s.right > cRect.left
						const vOverlap = s.top < cRect.bottom && s.bottom > cRect.top

						if (
							gaps.top > SIBLING_GAP_THRESHOLD &&
							hOverlap &&
							s.bottom <= cRect.top + SIBLING_TOLERANCE &&
							s.bottom >= cRect.top - gaps.top
						) {
							filled.top = true
						}
						if (
							gaps.bottom > SIBLING_GAP_THRESHOLD &&
							hOverlap &&
							s.top >= cRect.bottom - SIBLING_TOLERANCE &&
							s.top <= cRect.bottom + gaps.bottom
						) {
							filled.bottom = true
						}
						if (
							gaps.left > SIBLING_GAP_THRESHOLD &&
							vOverlap &&
							s.right <= cRect.left + SIBLING_TOLERANCE &&
							s.right >= cRect.left - gaps.left
						) {
							filled.left = true
						}
						if (
							gaps.right > SIBLING_GAP_THRESHOLD &&
							vOverlap &&
							s.left >= cRect.right - SIBLING_TOLERANCE &&
							s.left <= cRect.right + gaps.right
						) {
							filled.right = true
						}
					}
					return filled
				}

				const checkAxis = (
					gapA: number,
					gapB: number,
					sideA: string,
					sideB: string,
					filledA: boolean,
					filledB: boolean,
				): string | null => {
					const min = Math.min(gapA, gapB),
						max = Math.max(gapA, gapB)
					if (max < MIN_LARGE_GAP || max - min < MIN_GAP_DIFF) return null

					const largeSide = gapA > gapB ? sideA : sideB
					if (gapA > gapB ? filledA : filledB) return null

					if (min <= 2 && max >= MIN_LARGE_GAP) {
						const flush = gapA <= 2 ? sideA : sideB
						const opp = gapA <= 2 ? sideB : sideA
						return `content is flush with ${flush} edge, ${Math.round(max)}px gap on ${opp}`
					}
					if (min > 0) {
						const ratio = max / min
						if (ratio < IRREGULARITY_RATIO) return null
						const smallSide = gapA > gapB ? sideB : sideA
						return `${largeSide} gap (${Math.round(max)}px) is ${ratio.toFixed(1)}x larger than ${smallSide} (${Math.round(min)}px)`
					}
					return null
				}

				const checkPadding = (
					fill: number,
					gapA: number,
					gapB: number,
					dim: "horizontal" | "vertical",
				): string | null => {
					if (fill >= LOW_FILL) return null
					const total = gapA + gapB
					if (total < MIN_WASTED) return null
					const min = Math.min(gapA, gapB),
						max = Math.max(gapA, gapB)
					if (min > 0 && max / min > BALANCED_RATIO) return null
					return `content fills only ${Math.round(fill * 100)}% of ${dim} space (${Math.round(total)}px unused)`
				}

				const analyze = (
					container: HTMLElement,
					cRect: DOMRect,
					content: DOMRect,
				): string | null => {
					const fillH = content.width / cRect.width
					const fillV = content.height / cRect.height
					if (fillH < MIN_FILL && fillV < MIN_FILL) return null

					const gaps: Gaps = {
						top: content.top - cRect.top,
						right: cRect.right - content.right,
						bottom: cRect.bottom - content.bottom,
						left: content.left - cRect.left,
					}
					const filled = getSiblingFilled(container, cRect, gaps)
					const issues: string[] = []

					const hIssue = checkAxis(
						gaps.left,
						gaps.right,
						"left",
						"right",
						filled.left,
						filled.right,
					)
					if (hIssue) issues.push(hIssue)

					const vIssue = checkAxis(
						gaps.top,
						gaps.bottom,
						"top",
						"bottom",
						filled.top,
						filled.bottom,
					)
					if (vIssue) issues.push(vIssue)

					const hPad = checkPadding(fillH, gaps.left, gaps.right, "horizontal")
					if (hPad && !hIssue) issues.push(hPad)

					const vPad = checkPadding(fillV, gaps.top, gaps.bottom, "vertical")
					if (vPad && !vIssue) issues.push(vPad)

					return issues.length > 0
						? `Irregular spacing: ${issues.join("; ")}`
						: null
				}

				for (const el of scope.queryAll("*")) {
					if (!domHelpers.isHtmlElement(el) || !domHelpers.isVisible(el))
						continue
					if (el.children.length === 0) continue

					const cRect = el.getBoundingClientRect()
					if (
						!domHelpers.hasRectSize(
							cRect,
							MIN_CONTAINER_SIZE,
							MIN_CONTAINER_SIZE,
						)
					)
						continue
					if (!isLeafContainer(el)) continue

					const content = getChildrenBounds(el)
					if (
						!content ||
						!domHelpers.hasRectSize(content, MIN_CONTENT_SIZE, MIN_CONTENT_SIZE)
					)
						continue

					const msg = analyze(el, cRect, content)
					if (msg) report({ message: msg, element: el })
				}
			},
			{ domHelpers },
		)
	},
})
