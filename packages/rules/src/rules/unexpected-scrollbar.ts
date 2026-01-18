import { defineRule } from "viewlint/plugin"

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
		await context.evaluate(({ report }) => {
			const MIN_SCROLL_OVERFLOW = 1
			const MAX_UNEXPECTED_OVERFLOW = 20

			const isHTMLElement = (el: Element | null): el is HTMLElement => {
				return el instanceof HTMLElement
			}

			const isVisible = (el: HTMLElement): boolean => {
				const style = window.getComputedStyle(el)

				if (style.display === "none") return false
				if (style.visibility === "hidden" || style.visibility === "collapse")
					return false

				return true
			}

			const hasSize = (el: HTMLElement): boolean => {
				return el.clientWidth > 0 || el.clientHeight > 0
			}

			const canScroll = (overflowValue: string): boolean => {
				return overflowValue === "auto" || overflowValue === "scroll"
			}

			const checkElement = (el: HTMLElement): void => {
				if (!isVisible(el)) return
				if (!hasSize(el)) return

				const style = window.getComputedStyle(el)
				const overflowX = style.overflowX
				const overflowY = style.overflowY

				const canScrollX = canScroll(overflowX)
				const canScrollY = canScroll(overflowY)

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

			const allElements = document.querySelectorAll("*")

			for (const el of allElements) {
				if (!isHTMLElement(el)) continue
				if (el === document.documentElement || el === document.body) continue

				checkElement(el)
			}
		})
	},
})
