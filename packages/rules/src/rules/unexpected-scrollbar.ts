import { defineRule } from "viewlint/plugin"
import { getDomHelpersHandle } from "../utils/getDomHelpersHandle.js"

/**
 * Detects small/unexpected scrollbars that indicate layout overflow bugs.
 *
 * Finds elements where scroll distance is small (1-20px), which usually
 * indicates pixel/subpixel layout issues rather than intentional scrolling.
 */
export default defineRule({
	meta: {
		severity: "error",
		docs: {
			description: "Detects unexpected scrollbars from minor layout overflow",
			recommended: true,
		},
	},

	async run(context) {
		const domHelpers = await getDomHelpersHandle(context.page)

		await context.evaluate(
			({ report, scope, args: { domHelpers } }) => {
				const MIN_SCROLL_OVERFLOW = 1
				const MAX_UNEXPECTED_OVERFLOW = 20

				const hasSize = (el: HTMLElement): boolean => {
					return domHelpers.hasClientSize(el)
				}

				const checkElement = (el: HTMLElement): void => {
					if (!domHelpers.isVisible(el)) return
					if (!hasSize(el)) return

					const style = window.getComputedStyle(el)
					const overflowX = style.overflowX
					const overflowY = style.overflowY

					const canScrollX = domHelpers.canScroll(overflowX)
					const canScrollY = domHelpers.canScroll(overflowY)

					if (!canScrollX && !canScrollY) return

					const { scrollWidth, scrollHeight, clientWidth, clientHeight } = el

					const overflowAmountX = scrollWidth - clientWidth
					const overflowAmountY = scrollHeight - clientHeight

					const unexpectedX =
						canScrollX &&
						overflowAmountX >= MIN_SCROLL_OVERFLOW &&
						overflowAmountX <= MAX_UNEXPECTED_OVERFLOW

					const unexpectedY =
						canScrollY &&
						overflowAmountY >= MIN_SCROLL_OVERFLOW &&
						overflowAmountY <= MAX_UNEXPECTED_OVERFLOW

					if (!unexpectedX && !unexpectedY) return

					let message: string
					if (unexpectedX && unexpectedY) {
						message = `Unexpected scrollbar: element scrolls ${overflowAmountX}px horizontally and ${overflowAmountY}px vertically (likely a layout bug)`
					} else if (unexpectedX) {
						message = `Unexpected horizontal scrollbar: element scrolls ${overflowAmountX}px (likely a layout bug)`
					} else {
						message = `Unexpected vertical scrollbar: element scrolls ${overflowAmountY}px (likely a layout bug)`
					}

					report({
						message,
						element: el,
					})
				}

				checkElement(document.documentElement)
				if (document.body) {
					checkElement(document.body)
				}

				const allElements = scope.queryAll("*")

				for (const el of allElements) {
					if (!domHelpers.isHtmlElement(el)) continue
					if (el === document.documentElement || el === document.body) continue

					checkElement(el)
				}
			},
			{ domHelpers },
		)
	},
})
