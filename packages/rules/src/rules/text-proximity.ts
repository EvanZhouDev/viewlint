import { defineRule } from "viewlint/plugin"
import { getDomHelpersHandle } from "../utils/getDomHelpersHandle.js"

/**
 * Detects horizontally adjacent text elements that are too close together.
 *
 * When two text blocks are positioned very close horizontally, they can
 * appear as a single text block, causing readability issues where readers
 * cannot distinguish where one text ends and another begins.
 *
 * Uses actual text bounding boxes (via Range API), not element bounds.
 */
export default defineRule({
	meta: {
		severity: "warn",
		docs: {
			description:
				"Detects horizontally adjacent text elements that are too close together",
			recommended: false,
		},
	},

	async run(context) {
		const domHelpers = await getDomHelpersHandle(context.page)
		await context.evaluate(
			({ report, scope, args: { domHelpers } }) => {
				// 35% of font-size as threshold
				const MIN_GAP_FACTOR = 0.35
				// Absolute minimum gap in pixels (text under this is definitely too close)
				const MIN_GAP_PX = 3
				const MAX_VERTICAL_OVERLAP_TOLERANCE = 0.5
				const MIN_TEXT_LENGTH = 2

				const getDirectTextContent = (el: HTMLElement): string => {
					let text = ""

					for (const node of el.childNodes) {
						if (domHelpers.isTextNode(node)) {
							text += node.textContent || ""
						}
					}

					return text.trim()
				}

				const getFontSize = (el: HTMLElement): number => {
					const style = window.getComputedStyle(el)
					return parseFloat(style.fontSize) || 16
				}

				const areHorizontallyAdjacent = (
					a: DOMRect,
					b: DOMRect,
				): { gap: number; leftRect: "a" | "b" } | null => {
					const verticalOverlap =
						Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
					const minHeight = Math.min(a.height, b.height)

					if (verticalOverlap < minHeight * MAX_VERTICAL_OVERLAP_TOLERANCE) {
						return null
					}

					if (a.right <= b.left) {
						return { gap: b.left - a.right, leftRect: "a" }
					}

					if (b.right <= a.left) {
						return { gap: a.left - b.right, leftRect: "b" }
					}

					return null
				}

				type TextElement = {
					el: HTMLElement
					textRect: DOMRect
					fontSize: number
					text: string
				}

				const textElements: TextElement[] = []
				const allElements = scope.queryAll("*")

				for (const el of allElements) {
					if (!domHelpers.isHtmlElement(el)) continue
					if (!domHelpers.isVisible(el)) continue

					const textRect = domHelpers.getTextBounds(el, MIN_TEXT_LENGTH)
					if (!textRect) continue

					const fontSize = getFontSize(el)
					const text = getDirectTextContent(el)

					textElements.push({ el, textRect, fontSize, text })
				}

				const reportedPairs = new Set<string>()

				for (let i = 0; i < textElements.length; i++) {
					const a = textElements[i]
					if (!a) continue

					for (let j = i + 1; j < textElements.length; j++) {
						const b = textElements[j]
						if (!b) continue

						if (a.el.contains(b.el) || b.el.contains(a.el)) continue

						const adjacency = areHorizontallyAdjacent(a.textRect, b.textRect)
						if (!adjacency) continue

						const avgFontSize = (a.fontSize + b.fontSize) / 2
						// Use the higher of: absolute minimum or percentage of font-size
						const minGap = Math.max(MIN_GAP_PX, avgFontSize * MIN_GAP_FACTOR)

						if (adjacency.gap >= minGap) continue

						const leftEl = adjacency.leftRect === "a" ? a : b
						const rightEl = adjacency.leftRect === "a" ? b : a

						const leftParent = leftEl.el.parentElement
						const rightParent = rightEl.el.parentElement
						if (leftParent !== rightParent) continue

						const pairKey = [a.textRect, b.textRect]
							.map((r) => `${r.left.toFixed(0)},${r.top.toFixed(0)}`)
							.sort()
							.join("|")

						if (reportedPairs.has(pairKey)) continue
						reportedPairs.add(pairKey)

						const leftPreview =
							leftEl.text.slice(0, 15) + (leftEl.text.length > 15 ? "..." : "")
						const rightPreview =
							rightEl.text.slice(0, 15) +
							(rightEl.text.length > 15 ? "..." : "")

						report({
							message: `Text too close (${Math.round(adjacency.gap)}px gap, min ${Math.round(minGap)}px): "${leftPreview}" and "${rightPreview}"`,
							element: leftEl.el,
							relations: [
								{
									description: "Adjacent text element",
									element: rightEl.el,
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
