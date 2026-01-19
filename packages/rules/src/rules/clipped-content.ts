import { defineRule } from "viewlint/plugin"
import { getDomHelpersHandle } from "../utils/getDomHelpersHandle.js"

/**
 * Detects elements with overflow:hidden or overflow:clip that are clipping content.
 *
 * Compares scrollWidth/scrollHeight against clientWidth/clientHeight
 * to determine if content extends beyond the visible area.
 */
export default defineRule({
	meta: {
		severity: "error",
		docs: {
			description:
				"Detects content clipped by overflow:hidden or overflow:clip",
			recommended: true,
		},
	},

	async run(context) {
		const domHelpers = await getDomHelpersHandle(context.page)

		await context.evaluate(
			({ report, arg: { domHelpers } }) => {
				const CLIP_THRESHOLD = 1

				const isClippingOverflow = (value: string): boolean => {
					return value === "hidden" || value === "clip"
				}

				const allElements = document.querySelectorAll("*")

				for (const el of allElements) {
					if (!domHelpers.isHtmlElement(el)) continue
					if (!domHelpers.isVisible(el)) continue
					if (!domHelpers.hasClientSize(el)) continue

					const style = window.getComputedStyle(el)
					const overflowX = style.overflowX
					const overflowY = style.overflowY

					const clipsX = isClippingOverflow(overflowX)
					const clipsY = isClippingOverflow(overflowY)

					if (!clipsX && !clipsY) continue

					const { scrollWidth, scrollHeight, clientWidth, clientHeight } = el

					const clippedX = clipsX && scrollWidth - clientWidth > CLIP_THRESHOLD
					const clippedY =
						clipsY && scrollHeight - clientHeight > CLIP_THRESHOLD

					if (!clippedX && !clippedY) continue

					const clippedAmountX = scrollWidth - clientWidth
					const clippedAmountY = scrollHeight - clientHeight

					let message: string
					if (clippedX && clippedY) {
						message = `Content is clipped by ${Math.round(clippedAmountX)}px horizontally and ${Math.round(clippedAmountY)}px vertically`
					} else if (clippedX) {
						message = `Content is clipped by ${Math.round(clippedAmountX)}px horizontally`
					} else {
						message = `Content is clipped by ${Math.round(clippedAmountY)}px vertically`
					}

					report({
						message,
						element: el,
					})
				}
			},
			{ domHelpers },
		)
	},
})
