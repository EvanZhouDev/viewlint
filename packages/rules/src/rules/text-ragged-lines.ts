import { defineRule } from "viewlint/plugin"
import { getDomHelpersHandle } from "../utils/getDomHelpersHandle.js"

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
		const domHelpers = await getDomHelpersHandle(context.page)

		await context.evaluate(
			({ report, arg: { domHelpers } }) => {
				// 2 lines minimum - detect widows (short last line)
				const MIN_LINES = 2
				// Orphan/widow threshold for the LAST line
				const ORPHAN_LINE_RATIO = 0.45
				// Threshold for awkwardly short MIDDLE lines
				const MIDDLE_LINE_RATIO = 0.3
				// Minimum line width to count as a "substantial" line
				// Very short fragments still count for detecting issues
				const MIN_LINE_WIDTH = 5
				// Tolerance for grouping text into lines by Y position
				const Y_TOLERANCE = 3
				// Minimum element width to analyze (skip very narrow elements)
				const MIN_ELEMENT_WIDTH = 40

				type LineAccumulator = {
					y: number
					minLeft: number
					maxRight: number
				}

				type LineInfo = {
					y: number
					width: number
				}

				const getTextLines = (el: HTMLElement): LineInfo[] => {
					const rects = domHelpers
						.getTextRects(el)
						.filter((rect) => rect.width >= MIN_LINE_WIDTH)

					if (rects.length === 0) return []

					rects.sort((a, b) => a.top - b.top)

					const lines: LineAccumulator[] = []

					for (const rect of rects) {
						const existingLine = lines.find(
							(line) => Math.abs(line.y - rect.top) <= Y_TOLERANCE,
						)

						if (!existingLine) {
							lines.push({
								y: rect.top,
								minLeft: rect.left,
								maxRight: rect.right,
							})
							continue
						}

						existingLine.minLeft = Math.min(existingLine.minLeft, rect.left)
						existingLine.maxRight = Math.max(existingLine.maxRight, rect.right)
					}

					return lines
						.map((line) => ({
							y: line.y,
							width: line.maxRight - line.minLeft,
						}))
						.sort((a, b) => a.y - b.y)
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

					if (ratio < ORPHAN_LINE_RATIO) {
						return {
							shortLineIndex: lines.length,
							shortLineWidth: lastLine.width,
							longestWidth,
						}
					}

					// Check for awkwardly short lines in the middle
					for (let i = 1; i < lines.length - 1; i++) {
						const line = lines[i]
						if (!line) continue

						const midRatio = line.width / longestWidth

						if (midRatio < MIDDLE_LINE_RATIO) {
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
					if (!domHelpers.isHtmlElement(el)) continue
					if (!domHelpers.isVisible(el)) continue
					if (!domHelpers.hasElementRectSize(el)) continue

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
			},
			{ domHelpers },
		)
	},
})
