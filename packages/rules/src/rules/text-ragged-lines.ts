import { defineRule } from "viewlint/plugin"

/**
 * Detects text blocks with awkwardly short lines (ragged lines).
 *
 * Analyzes multi-line text to find lines that are significantly shorter
 * than others, which often looks unprofessional and may indicate layout
 * issues or poor text wrapping.
 */
export default defineRule({
	meta: {
		severity: "warn",
		docs: {
			description:
				"Detects text blocks with awkwardly short lines that disrupt visual flow",
			recommended: false,
		},
	},

	async run(context) {
		await context.evaluate(({ report }) => {
			// 2 lines minimum - detect widows (short last line)
			const MIN_LINES = 2
			// A line is "short" if it's less than 50% of the longest line
			const SHORT_LINE_RATIO = 0.25
			// Minimum line width to count as a "substantial" line
			// Very short fragments still count for detecting issues
			const MIN_LINE_WIDTH = 5
			// Tolerance for grouping text into lines by Y position
			const Y_TOLERANCE = 3
			// Minimum element width to analyze (skip very narrow elements)
			const MIN_ELEMENT_WIDTH = 40

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

			const hasSize = (el: HTMLElement): boolean => {
				const rect = el.getBoundingClientRect()
				return rect.width > 0 && rect.height > 0
			}

			const isTextNode = (node: ChildNode): node is Text => {
				return node.nodeType === Node.TEXT_NODE
			}

			const getDirectTextNodes = (el: HTMLElement): Text[] => {
				const textNodes: Text[] = []

				for (const node of el.childNodes) {
					if (isTextNode(node)) {
						const text = node.textContent?.trim()
						if (text && text.length > 0) {
							textNodes.push(node)
						}
					}
				}

				return textNodes
			}

			type LineInfo = {
				y: number
				width: number
				rects: DOMRect[]
			}

			const getTextLines = (el: HTMLElement): LineInfo[] => {
				const textNodes = getDirectTextNodes(el)
				if (textNodes.length === 0) return []

				const allRects: DOMRect[] = []

				for (const textNode of textNodes) {
					const range = document.createRange()
					range.selectNodeContents(textNode)
					const rects = range.getClientRects()

					for (const rect of rects) {
						if (rect.width < MIN_LINE_WIDTH) continue
						allRects.push(rect)
					}
				}

				if (allRects.length === 0) return []

				allRects.sort((a, b) => a.top - b.top)

				const lines: LineInfo[] = []

				for (const rect of allRects) {
					const existingLine = lines.find(
						(line) => Math.abs(line.y - rect.top) <= Y_TOLERANCE,
					)

					if (existingLine) {
						existingLine.rects.push(rect)
						existingLine.width = Math.max(
							existingLine.width,
							Math.max(...existingLine.rects.map((r) => r.right)) -
								Math.min(...existingLine.rects.map((r) => r.left)),
						)
					} else {
						lines.push({
							y: rect.top,
							width: rect.width,
							rects: [rect],
						})
					}
				}

				return lines.sort((a, b) => a.y - b.y)
			}

			const analyzeLines = (
				lines: LineInfo[],
			): {
				shortLineIndex: number
				shortLineWidth: number
				longestWidth: number
			} | null => {
				if (lines.length < MIN_LINES) return null

				const widths = lines.map((l) => l.width)
				const longestWidth = Math.max(...widths)

				if (longestWidth < MIN_LINE_WIDTH) return null

				// Check the last line for orphan/widow
				const lastLine = lines[lines.length - 1]
				if (!lastLine) return null

				const ratio = lastLine.width / longestWidth

				if (ratio < SHORT_LINE_RATIO) {
					return {
						shortLineIndex: lines.length,
						shortLineWidth: lastLine.width,
						longestWidth,
					}
				}

				// Also check for awkwardly short lines in the middle
				// (not the first or last line)
				for (let i = 1; i < lines.length - 1; i++) {
					const line = lines[i]
					if (!line) continue

					const midRatio = line.width / longestWidth

					// Middle lines should be even closer to full width
					if (midRatio < SHORT_LINE_RATIO * 0.8) {
						return {
							shortLineIndex: i + 1,
							shortLineWidth: line.width,
							longestWidth,
						}
					}
				}

				return null
			}

			const allElements = document.querySelectorAll("*")

			for (const el of allElements) {
				if (!isHTMLElement(el)) continue
				if (!isVisible(el)) continue
				if (!hasSize(el)) continue

				// Skip very narrow containers where multi-line is unavoidable
				const rect = el.getBoundingClientRect()
				if (rect.width < MIN_ELEMENT_WIDTH) continue

				const lines = getTextLines(el)
				if (lines.length < MIN_LINES) continue

				const analysis = analyzeLines(lines)
				if (!analysis) continue

				const percentage = Math.round(
					(analysis.shortLineWidth / analysis.longestWidth) * 100,
				)

				report({
					message: `Text has awkwardly short line ${analysis.shortLineIndex} of ${lines.length}: ${Math.round(analysis.shortLineWidth)}px wide (${percentage}% of longest ${Math.round(analysis.longestWidth)}px line)`,
					element: el,
				})
			}
		})
	},
})
