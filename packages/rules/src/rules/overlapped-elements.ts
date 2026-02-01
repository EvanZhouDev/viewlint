import { defineRule } from "viewlint/plugin"
import { getDomHelpersHandle } from "../utils/getDomHelpersHandle.js"

/**
 * Detects elements that overlap unintentionally within the same layout context.
 * - Elements must be visible in the viewport.
 * - Elements positioned absolute/fixed are not candidates.
 * - Overlap is only checked when both elements share the same nearest
 *   absolute/fixed ancestor (or neither has one).
 */
export default defineRule({
	meta: {
		severity: "error",
		docs: {
			description: "Detects elements that overlap unintentionally",
			recommended: true,
		},
	},

	async run(context) {
		const domHelpers = await getDomHelpersHandle(context.page)

		await context.evaluate(
			({ report, scope, args: { domHelpers } }) => {
				const OVERLAP_THRESHOLD = 5
				const MIN_ELEMENT_SIZE = 10
				const MIN_OVERLAP_PERCENT = 5
				const MIN_THIN_OVERLAP_PX = 12
				const MAX_THIN_OVERLAP_PERCENT = 20
				const MIN_NEGATIVE_MARGIN_OVERLAP_PERCENT = 50

				type ClipAncestor = { rect: DOMRect; clipsX: boolean; clipsY: boolean }

				const getClippingAncestors = (el: HTMLElement): ClipAncestor[] => {
					const ancestors: ClipAncestor[] = []
					let current = el.parentElement
					while (current) {
						const style = window.getComputedStyle(current)
						const clipsX = domHelpers.isClippingOverflowValue(style.overflowX)
						const clipsY = domHelpers.isClippingOverflowValue(style.overflowY)
						if (clipsX || clipsY) {
							ancestors.push({
								rect: current.getBoundingClientRect(),
								clipsX,
								clipsY,
							})
						}
						current = current.parentElement
					}
					return ancestors
				}

				const clipRectByAncestors = (
					rect: DOMRect,
					ancestors: ClipAncestor[],
				): DOMRect | null => {
					let left = rect.left,
						right = rect.right,
						top = rect.top,
						bottom = rect.bottom
					for (const ancestor of ancestors) {
						if (ancestor.clipsX) {
							left = Math.max(left, ancestor.rect.left)
							right = Math.min(right, ancestor.rect.right)
						}
						if (ancestor.clipsY) {
							top = Math.max(top, ancestor.rect.top)
							bottom = Math.min(bottom, ancestor.rect.bottom)
						}
					}
					const width = right - left,
						height = bottom - top
					if (width <= 0 || height <= 0) return null
					return new DOMRect(left, top, width, height)
				}

				const getRects = (el: HTMLElement): DOMRect[] => {
					const clippingAncestors = getClippingAncestors(el)
					const results: DOMRect[] = []
					for (const rect of el.getClientRects()) {
						const clipped = clipRectByAncestors(rect, clippingAncestors)
						if (!clipped) continue
						if (
							clipped.width < MIN_ELEMENT_SIZE ||
							clipped.height < MIN_ELEMENT_SIZE
						)
							continue
						results.push(clipped)
					}
					return results
				}

				const getArea = (rects: DOMRect[]): number => {
					let total = 0
					for (const rect of rects) total += rect.width * rect.height
					return total
				}

				const isCandidate = (el: HTMLElement): boolean => {
					if (!domHelpers.isVisibleInViewport(el)) return false
					const style = window.getComputedStyle(el)
					return (
						style.position !== "absolute" &&
						style.position !== "fixed" &&
						style.position !== "sticky"
					)
				}

				const hasTextDescendant = (el: HTMLElement): boolean => {
					const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
					let node: Node | null = walker.nextNode()
					while (node) {
						if (node.textContent && node.textContent.trim().length > 0)
							return true
						node = walker.nextNode()
					}
					return false
				}

				const isFloatWrapPair = (a: HTMLElement, b: HTMLElement): boolean => {
					const styleA = window.getComputedStyle(a)
					const styleB = window.getComputedStyle(b)
					const floatA = styleA.float !== "none"
					const floatB = styleB.float !== "none"
					if (floatA === floatB) return false
					if (a.parentElement !== b.parentElement) return false

					const otherEl = floatA ? b : a
					const otherStyle = floatA ? styleB : styleA
					if (
						otherStyle.position === "absolute" ||
						otherStyle.position === "fixed"
					)
						return false
					if (otherStyle.float !== "none") return false
					if (!hasTextDescendant(otherEl)) return false
					return true
				}

				const findLayoutRoot = (el: HTMLElement): HTMLElement | null => {
					let current = el.parentElement
					while (current) {
						const style = window.getComputedStyle(current)
						if (style.position === "absolute" || style.position === "fixed")
							return current
						current = current.parentElement
					}
					return null
				}

				const rectsOverlap = (a: DOMRect, b: DOMRect): boolean => {
					if (a.right <= b.left + OVERLAP_THRESHOLD) return false
					if (a.left >= b.right - OVERLAP_THRESHOLD) return false
					if (a.bottom <= b.top + OVERLAP_THRESHOLD) return false
					if (a.top >= b.bottom - OVERLAP_THRESHOLD) return false
					return true
				}

				type Candidate = {
					el: HTMLElement
					rects: DOMRect[]
					area: number
					layoutRoot: HTMLElement | null
				}
				type OverlapMetrics = {
					percent: number
					area: number
					width: number
					height: number
				}

				const candidates: Candidate[] = []
				const candidateByElement = new Map<HTMLElement, Candidate>()

				for (const el of scope.queryAll("*")) {
					if (!domHelpers.isHtmlElement(el)) continue
					if (!isCandidate(el)) continue
					const rects = getRects(el)
					if (rects.length === 0) continue
					const area = getArea(rects)
					if (area === 0) continue
					const candidate: Candidate = {
						el,
						rects,
						area,
						layoutRoot: findLayoutRoot(el),
					}
					candidates.push(candidate)
					candidateByElement.set(el, candidate)
				}

				const computeOverlapMetrics = (
					first: Candidate,
					second: Candidate,
				): OverlapMetrics => {
					let maxOverlapArea = 0,
						maxOverlapWidth = 0,
						maxOverlapHeight = 0
					for (const rectA of first.rects) {
						for (const rectB of second.rects) {
							if (!rectsOverlap(rectA, rectB)) continue
							const intersection = domHelpers.getIntersectionRect(rectA, rectB)
							if (!intersection) continue
							const area = intersection.width * intersection.height
							if (area > maxOverlapArea) {
								maxOverlapArea = area
								maxOverlapWidth = intersection.width
								maxOverlapHeight = intersection.height
							}
						}
					}
					if (maxOverlapArea === 0)
						return { percent: 0, area: 0, width: 0, height: 0 }
					const smallerArea = Math.min(first.area, second.area)
					if (smallerArea === 0) {
						return {
							percent: 0,
							area: maxOverlapArea,
							width: maxOverlapWidth,
							height: maxOverlapHeight,
						}
					}
					return {
						percent: Math.round((maxOverlapArea / smallerArea) * 100),
						area: maxOverlapArea,
						width: maxOverlapWidth,
						height: maxOverlapHeight,
					}
				}

				const parentOverlaps = (
					child: Candidate,
					other: Candidate,
				): boolean => {
					const parentElement = child.el.parentElement
					if (!parentElement) return false
					const parentCandidate = candidateByElement.get(parentElement)
					if (!parentCandidate) return false
					if (parentCandidate.layoutRoot !== other.layoutRoot) return false
					if (parentCandidate.el.contains(other.el)) return false
					return (
						computeOverlapMetrics(parentCandidate, other).percent >=
						MIN_OVERLAP_PERCENT
					)
				}

				for (let i = 0; i < candidates.length; i++) {
					const a = candidates[i]
					if (!a) continue

					for (let j = i + 1; j < candidates.length; j++) {
						const b = candidates[j]
						if (!b) continue
						if (a.layoutRoot !== b.layoutRoot) continue
						if (a.el.contains(b.el) || b.el.contains(a.el)) continue

						const overlap = computeOverlapMetrics(a, b)
						if (overlap.percent < MIN_OVERLAP_PERCENT) continue
						if (parentOverlaps(a, b) || parentOverlaps(b, a)) continue
						if (isFloatWrapPair(a.el, b.el)) continue

						const isThinOverlap =
							(overlap.width < MIN_THIN_OVERLAP_PX ||
								overlap.height < MIN_THIN_OVERLAP_PX) &&
							overlap.percent < MAX_THIN_OVERLAP_PERCENT
						if (isThinOverlap) continue

						const hasNegMargin =
							domHelpers.hasNegativeMargin(a.el) ||
							domHelpers.hasNegativeMargin(b.el)
						if (
							hasNegMargin &&
							overlap.percent < MIN_NEGATIVE_MARGIN_OVERLAP_PERCENT
						)
							continue

						report({
							message: `Elements overlap by ${overlap.percent}% of the smaller element's area`,
							element: a.el,
							relations: [
								{ description: "Overlapping element", element: b.el },
							],
						})
					}
				}
			},
			{ domHelpers },
		)
	},
})
