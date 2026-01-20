import { defineRule } from "viewlint/plugin"
import { getDomHelpersHandle } from "../utils/getDomHelpersHandle.js"

/**
 * Detects child elements whose corner radius violates the corner radius law.
 *
 * The corner radius law states that for nested rounded corners to look visually
 * coherent, the child's radius should equal `parent_radius - inset`, where inset
 * is the distance between the parent's inner edge and the child's outer edge.
 *
 * Only reports when the inset is small enough relative to the parent's radius
 * that the relationship matters visually (inset <= 0.5 * parent_radius).
 */
export default defineRule({
	meta: {
		severity: "warn",
		docs: {
			description:
				"Detects child elements with corner radius that violates the corner radius law for nested rounded corners",
			recommended: false,
		},
	},

	async run(context) {
		const domHelpers = await getDomHelpersHandle(context.page)

		await context.evaluate(
			({ report, scope, arg: { domHelpers } }) => {
				const TOLERANCE = 2

				const parseRadius = (value: string): number => {
					const parsed = parseFloat(value)
					return Number.isNaN(parsed) ? 0 : parsed
				}

				/**
				 * Gets the effective corner radius for an element.
				 * Returns an object with radii for each corner.
				 */
				const getCornerRadii = (
					style: CSSStyleDeclaration,
				): {
					topLeft: number
					topRight: number
					bottomRight: number
					bottomLeft: number
				} => {
					return {
						topLeft: parseRadius(style.borderTopLeftRadius),
						topRight: parseRadius(style.borderTopRightRadius),
						bottomRight: parseRadius(style.borderBottomRightRadius),
						bottomLeft: parseRadius(style.borderBottomLeftRadius),
					}
				}

				/**
				 * Calculates inset for each corner (distance from parent inner edge to child outer edge).
				 */
				const getCornerInsets = (
					parentRect: DOMRect,
					childRect: DOMRect,
				): {
					topLeft: number
					topRight: number
					bottomRight: number
					bottomLeft: number
				} => {
					const topInset = childRect.top - parentRect.top
					const rightInset = parentRect.right - childRect.right
					const bottomInset = parentRect.bottom - childRect.bottom
					const leftInset = childRect.left - parentRect.left

					return {
						topLeft: Math.min(topInset, leftInset),
						topRight: Math.min(topInset, rightInset),
						bottomRight: Math.min(bottomInset, rightInset),
						bottomLeft: Math.min(bottomInset, leftInset),
					}
				}

				const hasRoundedCorners = (radii: {
					topLeft: number
					topRight: number
					bottomRight: number
					bottomLeft: number
				}): boolean => {
					return (
						radii.topLeft > 0 ||
						radii.topRight > 0 ||
						radii.bottomRight > 0 ||
						radii.bottomLeft > 0
					)
				}

				/**
				 * Checks if the element has visible styling that would make corner radius visible.
				 * An element needs a border, background, or box-shadow for its corners to be seen.
				 */
				const hasVisibleCorners = (style: CSSStyleDeclaration): boolean => {
					// Check for visible border on any side
					const borderWidths = [
						parseFloat(style.borderTopWidth) || 0,
						parseFloat(style.borderRightWidth) || 0,
						parseFloat(style.borderBottomWidth) || 0,
						parseFloat(style.borderLeftWidth) || 0,
					]
					const hasVisibleBorder = borderWidths.some((w) => w > 0)
					if (hasVisibleBorder) return true

					// Check for visible background color (not transparent)
					const bgColor = style.backgroundColor
					if (
						bgColor &&
						bgColor !== "transparent" &&
						bgColor !== "rgba(0, 0, 0, 0)"
					) {
						return true
					}

					// Check for background image
					const bgImage = style.backgroundImage
					if (bgImage && bgImage !== "none") {
						return true
					}

					// Check for box shadow
					const boxShadow = style.boxShadow
					if (boxShadow && boxShadow !== "none") {
						return true
					}

					// Check for outline (although not affected by border-radius, can indicate intent)
					const outlineWidth = parseFloat(style.outlineWidth) || 0
					if (outlineWidth > 0) {
						return true
					}

					return false
				}

				const allElements = scope.queryAll("*")

				for (const el of allElements) {
					if (!domHelpers.isHtmlElement(el)) continue
					if (!domHelpers.isVisible(el)) continue
					if (!domHelpers.hasElementRectSize(el)) continue

					const parent = el.parentElement
					if (!domHelpers.isHtmlElement(parent)) continue
					if (!domHelpers.isVisible(parent)) continue
					if (!domHelpers.hasElementRectSize(parent)) continue

					const parentStyle = window.getComputedStyle(parent)
					const parentRadii = getCornerRadii(parentStyle)

					if (!hasRoundedCorners(parentRadii)) continue

					const childStyle = window.getComputedStyle(el)

					// Skip elements without visible styling that would show corner radius
					// (no border, background, or box-shadow = invisible corners)
					if (!hasVisibleCorners(childStyle)) continue

					const childRadii = getCornerRadii(childStyle)

					const parentRect = parent.getBoundingClientRect()
					const childRect = el.getBoundingClientRect()

					const insets = getCornerInsets(parentRect, childRect)

					type CornerName =
						| "topLeft"
						| "topRight"
						| "bottomRight"
						| "bottomLeft"
					const corners: CornerName[] = [
						"topLeft",
						"topRight",
						"bottomRight",
						"bottomLeft",
					]

					const violations: string[] = []

					for (const corner of corners) {
						const parentRadius = parentRadii[corner]
						const childRadius = childRadii[corner]
						const inset = insets[corner]

						if (parentRadius <= 0) continue
						if (inset > 0.5 * parentRadius) continue
						if (inset < 0) continue

						const expectedChildRadius = Math.max(0, parentRadius - inset)

						const difference = Math.abs(childRadius - expectedChildRadius)
						if (difference <= TOLERANCE) continue

						const cornerLabel = corner
							.replace(/([A-Z])/g, "-$1")
							.toLowerCase()
							.replace(/^-/, "")

						violations.push(
							`${cornerLabel}: expected ~${Math.round(expectedChildRadius)}px, found ${Math.round(childRadius)}px`,
						)
					}

					if (violations.length > 0) {
						report({
							message: `Corner radius violates nesting law: ${violations.join("; ")}`,
							element: el,
							relations: [
								{
									description: "Parent with rounded corners",
									element: parent,
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
