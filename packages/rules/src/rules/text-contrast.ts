import sharp from "sharp"
import { defineRule } from "viewlint/plugin"
import { getDomHelpersHandle } from "../utils/getDomHelpersHandle.js"

/**
 * Detects text with low contrast against its background.
 *
 * Uses screenshot-based analysis to sample the actual rendered background
 * color behind text elements, then calculates WCAG contrast ratio.
 */
export default defineRule({
	meta: {
		severity: "warn",
		docs: {
			description: "Detects text with low contrast against background",
			recommended: true,
		},
	},

	async run(context) {
		const MINIMUM_CONTRAST_RATIO = 2.0

		// Collect text elements and their info from the page
		type TextElementInfo = {
			selector: string
			textColor: { r: number; g: number; b: number }
			rect: { x: number; y: number; width: number; height: number }
		}

		const domHelpers = await getDomHelpersHandle(context.page)

		const textElements = await context.evaluate(
			({ scope, args: { domHelpers } }) => {
				const hasDirectTextContent = (el: HTMLElement): boolean => {
					return domHelpers.getDirectTextNodes(el).length > 0
				}

				const parseColor = (
					colorString: string,
				): { r: number; g: number; b: number; a: number } | null => {
					if (!colorString || colorString === "transparent") {
						return { r: 0, g: 0, b: 0, a: 0 }
					}

					const canvas = document.createElement("canvas")
					canvas.width = 1
					canvas.height = 1
					const ctx = canvas.getContext("2d")
					if (!ctx) return null

					ctx.clearRect(0, 0, 1, 1)
					ctx.fillStyle = colorString
					ctx.fillRect(0, 0, 1, 1)

					const imageData = ctx.getImageData(0, 0, 1, 1)
					const [r, g, b, a] = imageData.data

					if (
						r === undefined ||
						g === undefined ||
						b === undefined ||
						a === undefined
					) {
						return null
					}

					return { r, g, b, a: a / 255 }
				}

				const getUniqueSelector = (el: Element): string => {
					if (window.__viewlint_finder) {
						return window.__viewlint_finder(el)
					}

					// Fallback
					if (el.id) return `#${el.id}`
					return el.tagName.toLowerCase()
				}

				const results: TextElementInfo[] = []
				const allElements = scope.queryAll("*")

				for (const el of allElements) {
					if (!domHelpers.isHtmlElement(el)) continue

					if (!domHelpers.isVisible(el)) continue
					if (!hasDirectTextContent(el)) continue

					const style = window.getComputedStyle(el)
					const textColor = parseColor(style.color)
					if (!textColor) continue

					const rect = domHelpers.getTextBounds(el, 1)
					if (!rect) continue

					// Skip elements outside viewport
					if (
						rect.bottom <= 0 ||
						rect.right <= 0 ||
						rect.top >= window.innerHeight ||
						rect.left >= window.innerWidth
					)
						continue

					results.push({
						selector: getUniqueSelector(el),
						textColor: { r: textColor.r, g: textColor.g, b: textColor.b },
						rect: {
							x: rect.x,
							y: rect.y,
							width: rect.width,
							height: rect.height,
						},
					})
				}

				return results
			},
			{ domHelpers },
		)

		if (textElements.length === 0) return

		// Take a screenshot for background sampling
		const screenshotBuffer = await context.page.screenshot({ type: "png" })

		// Decode PNG to get pixel data

		const image = sharp(screenshotBuffer)
		const metadata = await image.metadata()
		const { width: imgWidth, height: imgHeight } = metadata

		if (!imgWidth || !imgHeight) return

		// Get raw pixel data
		const { data: pixels, info } = await image
			.raw()
			.toBuffer({ resolveWithObject: true })

		const getPixel = (
			x: number,
			y: number,
		): { r: number; g: number; b: number } | null => {
			const px = Math.floor(x)
			const py = Math.floor(y)

			if (px < 0 || px >= info.width || py < 0 || py >= info.height) {
				return null
			}

			const idx = (py * info.width + px) * info.channels
			const r = pixels[idx]
			const g = pixels[idx + 1]
			const b = pixels[idx + 2]

			if (r === undefined || g === undefined || b === undefined) {
				return null
			}

			return { r, g, b }
		}

		const relativeLuminance = (color: {
			r: number
			g: number
			b: number
		}): number => {
			const sRGB = [color.r, color.g, color.b].map((c) => {
				const s = c / 255
				return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
			})

			const r = sRGB[0] ?? 0
			const g = sRGB[1] ?? 0
			const b = sRGB[2] ?? 0

			return 0.2126 * r + 0.7152 * g + 0.0722 * b
		}

		const contrastRatio = (
			color1: { r: number; g: number; b: number },
			color2: { r: number; g: number; b: number },
		): number => {
			const l1 = relativeLuminance(color1)
			const l2 = relativeLuminance(color2)

			const lighter = Math.max(l1, l2)
			const darker = Math.min(l1, l2)

			return (lighter + 0.05) / (darker + 0.05)
		}

		const formatColor = (color: {
			r: number
			g: number
			b: number
		}): string => {
			return `rgb(${color.r}, ${color.g}, ${color.b})`
		}

		// Sample background color by averaging pixels around the element edges
		const sampleBackground = (rect: {
			x: number
			y: number
			width: number
			height: number
		}): { r: number; g: number; b: number } | null => {
			const samples: { r: number; g: number; b: number }[] = []

			// Sample from multiple points around the text bounds.
			// Avoid sampling "around the element" because padding/background from
			// surrounding layout can produce unexpected results.
			const samplePoints = [
				// Corners (slightly inside)
				{ x: rect.x + 2, y: rect.y + 2 },
				{ x: rect.x + rect.width - 2, y: rect.y + 2 },
				{ x: rect.x + 2, y: rect.y + rect.height - 2 },
				{ x: rect.x + rect.width - 2, y: rect.y + rect.height - 2 },
				// Edge midpoints (slightly inside)
				{ x: rect.x + rect.width / 2, y: rect.y + 2 },
				{ x: rect.x + rect.width / 2, y: rect.y + rect.height - 2 },
				{ x: rect.x + 2, y: rect.y + rect.height / 2 },
				{ x: rect.x + rect.width - 2, y: rect.y + rect.height / 2 },
				// Center
				{ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 },
			]

			for (const point of samplePoints) {
				const pixel = getPixel(point.x, point.y)
				if (pixel) samples.push(pixel)
			}

			if (samples.length === 0) return null

			// Average the samples
			let totalR = 0
			let totalG = 0
			let totalB = 0

			for (const sample of samples) {
				totalR += sample.r
				totalG += sample.g
				totalB += sample.b
			}

			return {
				r: Math.round(totalR / samples.length),
				g: Math.round(totalG / samples.length),
				b: Math.round(totalB / samples.length),
			}
		}

		// Check contrast for each text element
		for (const element of textElements) {
			const bgColor = sampleBackground(element.rect)
			if (!bgColor) continue

			const ratio = contrastRatio(element.textColor, bgColor)

			if (ratio >= MINIMUM_CONTRAST_RATIO) continue

			const ratioFormatted = ratio.toFixed(2)

			// Report via evaluate to get proper element reference
			await context.evaluate(
				({ report, args }) => {
					const el = document.querySelector(args.selector)
					if (!el || !(el instanceof HTMLElement)) return

					report({
						message: `Text has low contrast ratio of ${args.ratioFormatted}:1 (minimum ${args.minimumRatio}:1). Text color: ${args.textColorStr}, background: ${args.bgColorStr}`,
						element: el,
					})
				},
				{
					selector: element.selector,
					ratioFormatted,
					minimumRatio: MINIMUM_CONTRAST_RATIO,
					textColorStr: formatColor(element.textColor),
					bgColorStr: formatColor(bgColor),
				},
			)
		}
	},
})
