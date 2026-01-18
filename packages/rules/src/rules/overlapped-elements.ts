import { defineRule } from "viewlint/plugin"

/**
 * Detects elements that overlap unintentionally.
 *
 * Reports only root-cause overlaps by skipping children when their parent
 * already overlaps the same element.
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
		await context.evaluate(({ report }) => {
			const OVERLAP_THRESHOLD = 5
			const MIN_ELEMENT_SIZE = 50
			const VIEWPORT_COVER_RATIO = 0.9

			const isHTMLElement = (el: Element | null): el is HTMLElement => {
				return el instanceof HTMLElement
			}

			const getRect = (el: HTMLElement): DOMRect | null => {
				const rect = el.getBoundingClientRect()
				if (rect.width < MIN_ELEMENT_SIZE || rect.height < MIN_ELEMENT_SIZE) {
					return null
				}
				return rect
			}

			const isCandidate = (el: HTMLElement): boolean => {
				const style = window.getComputedStyle(el)

				if (style.display === "none") return false
				if (style.visibility === "hidden" || style.visibility === "collapse") {
					return false
				}
				if (parseFloat(style.opacity) === 0) return false

				const display = style.display
				if (
					display !== "block" &&
					display !== "flex" &&
					display !== "grid" &&
					display !== "table" &&
					display !== "flow-root"
				) {
					return false
				}

				if (style.position === "absolute" || style.position === "fixed") {
					const zIndex = parseInt(style.zIndex, 10)
					if (!Number.isNaN(zIndex) && zIndex > 10) return false
				}

				return true
			}

			const rectsOverlap = (a: DOMRect, b: DOMRect): boolean => {
				if (a.right <= b.left + OVERLAP_THRESHOLD) return false
				if (a.left >= b.right - OVERLAP_THRESHOLD) return false
				if (a.bottom <= b.top + OVERLAP_THRESHOLD) return false
				if (a.top >= b.bottom - OVERLAP_THRESHOLD) return false
				return true
			}

			const overlapArea = (a: DOMRect, b: DOMRect): number => {
				const overlapLeft = Math.max(a.left, b.left)
				const overlapRight = Math.min(a.right, b.right)
				const overlapTop = Math.max(a.top, b.top)
				const overlapBottom = Math.min(a.bottom, b.bottom)
				const overlapWidth = Math.max(0, overlapRight - overlapLeft)
				const overlapHeight = Math.max(0, overlapBottom - overlapTop)
				return overlapWidth * overlapHeight
			}

			const isFullViewportLayer = (el: HTMLElement, rect: DOMRect): boolean => {
				const style = window.getComputedStyle(el)
				if (style.position !== "fixed" && style.position !== "absolute") {
					return false
				}

				const coversWidth =
					rect.width / window.innerWidth >= VIEWPORT_COVER_RATIO
				const coversHeight =
					rect.height / window.innerHeight >= VIEWPORT_COVER_RATIO

				return coversWidth && coversHeight
			}

			type Candidate = { el: HTMLElement; rect: DOMRect; area: number }
			const candidates: Candidate[] = []

			for (const el of document.querySelectorAll("*")) {
				if (!isHTMLElement(el)) continue
				if (!isCandidate(el)) continue

				const rect = getRect(el)
				if (!rect) continue

				candidates.push({
					el,
					rect,
					area: rect.width * rect.height,
				})
			}

			const parentOverlaps = (
				child: HTMLElement,
				other: HTMLElement,
				otherRect: DOMRect,
			): boolean => {
				const parent = child.parentElement
				if (!parent || !isHTMLElement(parent)) return false
				if (parent.contains(other)) return false
				if (!isCandidate(parent)) return false

				const parentRect = getRect(parent)
				if (!parentRect) return false

				return rectsOverlap(parentRect, otherRect)
			}

			for (let i = 0; i < candidates.length; i++) {
				const a = candidates[i]
				if (!a) continue

				for (let j = i + 1; j < candidates.length; j++) {
					const b = candidates[j]
					if (!b) continue

					if (a.el.contains(b.el) || b.el.contains(a.el)) continue
					if (isFullViewportLayer(a.el, a.rect)) continue
					if (isFullViewportLayer(b.el, b.rect)) continue
					if (!rectsOverlap(a.rect, b.rect)) continue
					if (parentOverlaps(a.el, b.el, b.rect)) continue
					if (parentOverlaps(b.el, a.el, a.rect)) continue

					const overlap = overlapArea(a.rect, b.rect)
					const smallerArea = Math.min(a.area, b.area)
					if (smallerArea === 0) continue

					const overlapPercentage = Math.round((overlap / smallerArea) * 100)
					if (overlapPercentage < 5) continue

					report({
						message: `Elements overlap by ${overlapPercentage}% of the smaller element's area`,
						element: a.el,
						relations: [
							{
								description: "Overlapping element",
								element: b.el,
							},
						],
					})
				}
			}
		})
	},
})
