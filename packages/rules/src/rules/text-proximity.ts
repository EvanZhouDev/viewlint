import { defineRule } from "viewlint/plugin"

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
		await context.evaluate(({ report }) => {
			// 35% of font-size as threshold
			const MIN_GAP_FACTOR = 0.35
			// Absolute minimum gap in pixels (text under this is definitely too close)
			const MIN_GAP_PX = 3
			const MAX_VERTICAL_OVERLAP_TOLERANCE = 0.5
			const MIN_TEXT_LENGTH = 2

			const isHTMLElement = (el: Element | null): el is HTMLElement => {
				return el instanceof HTMLElement
			}

			const isVisible = (el: HTMLElement): boolean => {
				const style = window.getComputedStyle(el)

				if (style.display === "none") return false
				if (style.visibility === "hidden" || style.visibility === "collapse") {
					return false
				}
				if (parseFloat(style.opacity) === 0) return false

				return true
			}

			const isTextNode = (node: ChildNode): node is Text => {
				return node.nodeType === Node.TEXT_NODE
			}

			/**
			 * Gets the bounding box of actual text content using Range API.
			 * Returns null if no substantial text.
			 */
			const getTextBounds = (el: HTMLElement): DOMRect | null => {
				let minLeft = Infinity
				let minTop = Infinity
				let maxRight = -Infinity
				let maxBottom = -Infinity
				let hasText = false

				for (const node of el.childNodes) {
					if (!isTextNode(node)) continue

					const text = node.textContent?.trim()
					if (!text || text.length < MIN_TEXT_LENGTH) continue

					const range = document.createRange()
					range.selectNodeContents(node)
					const rects = range.getClientRects()

					for (const rect of rects) {
						if (rect.width === 0 || rect.height === 0) continue

						hasText = true
						minLeft = Math.min(minLeft, rect.left)
						minTop = Math.min(minTop, rect.top)
						maxRight = Math.max(maxRight, rect.right)
						maxBottom = Math.max(maxBottom, rect.bottom)
					}
				}

				if (!hasText) return null

				return new DOMRect(
					minLeft,
					minTop,
					maxRight - minLeft,
					maxBottom - minTop,
				)
			}

			const getDirectTextContent = (el: HTMLElement): string => {
				let text = ""

				for (const node of el.childNodes) {
					if (isTextNode(node)) {
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
			const allElements = document.querySelectorAll("*")

			for (const el of allElements) {
				if (!isHTMLElement(el)) continue
				if (!isVisible(el)) continue

				const textRect = getTextBounds(el)
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
						rightEl.text.slice(0, 15) + (rightEl.text.length > 15 ? "..." : "")

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
		})
	},
})
