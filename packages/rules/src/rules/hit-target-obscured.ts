import { defineRule } from "viewlint/plugin"
import { getDomHelpersHandle } from "../utils/getDomHelpersHandle.js"

/**
 * Detects interactive elements that are obscured by other elements,
 * making them unclickable or partially unclickable.
 *
 * Uses elementFromPoint to sample click positions and verify the element
 * or its descendants receive the click.
 */
export default defineRule({
	meta: {
		severity: "error",
		docs: {
			description:
				"Detects clickable elements that are obscured by other elements",
			recommended: true,
		},
	},

	async run(context) {
		const domHelpers = await getDomHelpersHandle(context.page)

		await context.evaluate(
			({ report, arg: { domHelpers } }) => {
				const isInteractive = (el: Element): boolean => {
					const tagName = el.tagName.toLowerCase()
					const interactiveTags = [
						"a",
						"button",
						"input",
						"select",
						"textarea",
						"label",
					]

					if (interactiveTags.includes(tagName)) return true

					if (el.hasAttribute("onclick")) return true
					if (el.hasAttribute("tabindex")) {
						const tabindex = el.getAttribute("tabindex")
						if (tabindex && parseInt(tabindex, 10) >= 0) return true
					}

					const role = el.getAttribute("role")
					if (role === "button" || role === "link" || role === "menuitem") {
						return true
					}

					return false
				}

				const isDisabled = (el: Element): boolean => {
					if (el.hasAttribute("disabled")) return true
					if (el.getAttribute("aria-disabled") === "true") return true
					return false
				}

				const getRect = (el: Element): DOMRect | null => {
					const rect = el.getBoundingClientRect()

					if (rect.width <= 0 || rect.height <= 0) return null

					return rect
				}

				const isInViewport = (rect: DOMRect): boolean => {
					return (
						rect.bottom > 0 &&
						rect.right > 0 &&
						rect.top < window.innerHeight &&
						rect.left < window.innerWidth
					)
				}

				const getSamplePoints = (
					rect: DOMRect,
				): Array<{ x: number; y: number }> => {
					const points: Array<{ x: number; y: number }> = []

					const padding = 2

					const left = rect.left + padding
					const right = rect.right - padding
					const top = rect.top + padding
					const bottom = rect.bottom - padding

					if (left >= right || top >= bottom) {
						points.push({
							x: rect.left + rect.width / 2,
							y: rect.top + rect.height / 2,
						})
						return points
					}

					const centerX = (left + right) / 2
					const centerY = (top + bottom) / 2

					points.push({ x: centerX, y: centerY })

					points.push({ x: left, y: top })
					points.push({ x: right, y: top })
					points.push({ x: left, y: bottom })
					points.push({ x: right, y: bottom })

					points.push({ x: centerX, y: top })
					points.push({ x: centerX, y: bottom })
					points.push({ x: left, y: centerY })
					points.push({ x: right, y: centerY })

					return points.filter(
						(p) =>
							p.x >= 0 &&
							p.y >= 0 &&
							p.x < window.innerWidth &&
							p.y < window.innerHeight,
					)
				}

				const isElementOrDescendant = (
					target: Element,
					elementAtPoint: Element | null,
				): boolean => {
					if (!elementAtPoint) return false
					if (target === elementAtPoint) return true
					if (target.contains(elementAtPoint)) return true
					if (elementAtPoint.contains(target)) return true
					return false
				}

				const allElements = document.querySelectorAll("*")

				for (const el of allElements) {
					if (!domHelpers.isHtmlElement(el)) continue
					if (!isInteractive(el)) continue
					if (!domHelpers.isVisible(el, { checkPointerEvents: true })) continue
					if (isDisabled(el)) continue

					const rect = getRect(el)
					if (!rect) continue
					if (!isInViewport(rect)) continue

					const samplePoints = getSamplePoints(rect)
					if (samplePoints.length === 0) continue

					let obscuredCount = 0
					let totalChecked = 0
					let obscuringElement: HTMLElement | null = null

					for (const point of samplePoints) {
						const elementAtPoint = document.elementFromPoint(point.x, point.y)
						totalChecked++

						if (!isElementOrDescendant(el, elementAtPoint)) {
							obscuredCount++

							if (
								!obscuringElement &&
								elementAtPoint &&
								domHelpers.isHtmlElement(elementAtPoint)
							) {
								obscuringElement = elementAtPoint
							}
						}
					}

					if (obscuredCount > 0 && totalChecked > 0) {
						const obscuredRatio = obscuredCount / totalChecked

						if (obscuredRatio >= 0.5) {
							const percentage = Math.round(obscuredRatio * 100)

							if (obscuringElement) {
								report({
									message: `Interactive element is ~${percentage}% obscured and may not be clickable`,
									element: el,
									relations: [
										{
											description: "Obscuring element",
											element: obscuringElement,
										},
									],
								})
							} else {
								report({
									message: `Interactive element is ~${percentage}% obscured and may not be clickable`,
									element: el,
								})
							}
						}
					}
				}
			},
			{ domHelpers },
		)
	},
})
