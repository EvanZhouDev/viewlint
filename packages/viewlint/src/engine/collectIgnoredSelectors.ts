import type { Page } from "playwright"

export async function collectIgnoredSelectors(
	page: Page,
	ruleId: string,
	selectors: string[],
): Promise<Set<string>> {
	const uniqueSelectors = [...new Set(selectors)].filter(
		(selector) => selector.trim().length > 0,
	)
	if (uniqueSelectors.length === 0) return new Set()

	const ignoredSelectors: string[] = await page.evaluate(
		(payload: { ruleId: string; selectors: string[] }) => {
			const tokenize = (value: string): string[] => {
				return value
					.split(/[\s,]+/)
					.map((token) => token.trim())
					.filter((token) => token.length > 0)
			}

			const matchesRule = (tokens: string[], ruleId: string): boolean => {
				return (
					tokens.length === 0 ||
					tokens.includes("all") ||
					tokens.includes("*") ||
					tokens.includes(ruleId)
				)
			}

			const isIgnored = (el: Element | null, ruleId: string): boolean => {
				let current: Element | null = el

				while (current) {
					if (current.hasAttribute("data-viewlint-ignore")) {
						const raw = current.getAttribute("data-viewlint-ignore")
						const tokens = raw ? tokenize(raw) : []
						if (matchesRule(tokens, ruleId)) return true
					}

					current = current.parentElement
				}

				return false
			}

			return payload.selectors.filter((selector) => {
				try {
					const el = document.querySelector(selector)
					return isIgnored(el, payload.ruleId)
				} catch {
					return false
				}
			})
		},
		{ ruleId, selectors: uniqueSelectors },
	)

	return new Set(ignoredSelectors)
}
