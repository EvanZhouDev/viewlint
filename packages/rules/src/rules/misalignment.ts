import { defineRule } from "viewlint/plugin"
import { getDomHelpersHandle } from "../utils/getDomHelpersHandle.js"

/**
 * Detects elements that appear to be intended for alignment but are slightly misaligned.
 *
 * Finds the closest alignment edge between siblings and reports only if that edge
 * is in the "mistake range" - close enough that it looks like an alignment attempt
 * but not quite aligned perfectly.
 */
export default defineRule({
	meta: {
		severity: "warn",
		docs: {
			description:
				"Detects elements that should be aligned but are slightly off",
			recommended: false,
		},
	},

	async run(context) {
		const domHelpers = await getDomHelpersHandle(context.page)

		await context.evaluate(
			({ report, arg: { domHelpers } }) => {
				const PERFECT_THRESHOLD = 1
				const MIN_MISALIGN = 2
				const MAX_MISALIGN = 6
				const MIN_ELEMENT_SIZE = 24

				const hasSize = (el: HTMLElement): boolean => {
					return domHelpers.hasElementRectSize(
						el,
						MIN_ELEMENT_SIZE,
						MIN_ELEMENT_SIZE,
					)
				}

				const isLayoutChild = (el: HTMLElement): boolean => {
					const parent = el.parentElement
					if (!parent) return false

					const parentStyle = window.getComputedStyle(parent)
					const display = parentStyle.display

					return display === "flex" || display === "inline-flex"
				}

				const getFlexDirection = (el: HTMLElement): "row" | "column" | null => {
					const parent = el.parentElement
					if (!parent) return null

					const parentStyle = window.getComputedStyle(parent)
					if (
						parentStyle.display !== "flex" &&
						parentStyle.display !== "inline-flex"
					) {
						return null
					}

					const dir = parentStyle.flexDirection
					return dir === "column" || dir === "column-reverse" ? "column" : "row"
				}

				type EdgeAlignment = {
					edge: string
					offset: number
				}

				/**
				 * Gets alignment offsets for edges that make sense given the flex direction.
				 * For row layouts: check vertical alignment (top, bottom, center-y)
				 * For column layouts: check horizontal alignment (left, right, center-x)
				 */
				const getRelevantAlignments = (
					a: DOMRect,
					b: DOMRect,
					direction: "row" | "column",
				): EdgeAlignment[] => {
					if (direction === "row") {
						return [
							{ edge: "top", offset: Math.abs(a.top - b.top) },
							{ edge: "bottom", offset: Math.abs(a.bottom - b.bottom) },
							{
								edge: "center-y",
								offset: Math.abs(
									(a.top + a.bottom) / 2 - (b.top + b.bottom) / 2,
								),
							},
						]
					}

					return [
						{ edge: "left", offset: Math.abs(a.left - b.left) },
						{ edge: "right", offset: Math.abs(a.right - b.right) },
						{
							edge: "center-x",
							offset: Math.abs((a.left + a.right) / 2 - (b.left + b.right) / 2),
						},
					]
				}

				/**
				 * Finds misalignment only if:
				 * 1. One edge is clearly the "intended" alignment (closest)
				 * 2. But it's not quite perfect (in the mistake range)
				 * 3. No other edge is perfectly aligned
				 */
				const findMisalignment = (
					a: DOMRect,
					b: DOMRect,
					direction: "row" | "column",
				): EdgeAlignment | null => {
					const alignments = getRelevantAlignments(a, b, direction)

					alignments.sort((x, y) => x.offset - y.offset)

					const hasAnyPerfectAlignment = alignments.some(
						(al) => al.offset <= PERFECT_THRESHOLD,
					)
					if (hasAnyPerfectAlignment) return null

					const closest = alignments[0]
					if (!closest) return null

					if (
						closest.offset >= MIN_MISALIGN &&
						closest.offset <= MAX_MISALIGN
					) {
						return closest
					}

					return null
				}

				const reportedPairs = new Set<string>()

				const getSiblings = (el: HTMLElement): HTMLElement[] => {
					const parent = el.parentElement
					if (!parent) return []

					const siblings: HTMLElement[] = []
					for (const child of parent.children) {
						if (child === el) continue
						if (!domHelpers.isHtmlElement(child)) continue
						if (!domHelpers.isVisible(child)) continue
						if (!hasSize(child)) continue

						siblings.push(child)
					}

					return siblings
				}

				const allElements = document.querySelectorAll("*")

				for (const el of allElements) {
					if (!domHelpers.isHtmlElement(el)) continue
					if (!domHelpers.isVisible(el)) continue
					if (!hasSize(el)) continue
					if (!isLayoutChild(el)) continue

					const direction = getFlexDirection(el)
					if (!direction) continue

					const rect = el.getBoundingClientRect()
					const siblings = getSiblings(el)

					for (const sibling of siblings) {
						const siblingRect = sibling.getBoundingClientRect()

						const pairKey = [rect, siblingRect]
							.map((r) => `${r.left.toFixed(0)},${r.top.toFixed(0)}`)
							.sort()
							.join("|")

						if (reportedPairs.has(pairKey)) continue

						const misalignment = findMisalignment(rect, siblingRect, direction)
						if (!misalignment) continue

						reportedPairs.add(pairKey)

						report({
							message: `Sibling elements misaligned: ${misalignment.edge} edges differ by ${Math.round(misalignment.offset)}px`,
							element: el,
							relations: [
								{
									description: "Misaligned sibling",
									element: sibling,
								},
							],
						})
					}
				}
			},
			{ domHelpers },
		)
	},
})
