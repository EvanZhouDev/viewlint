import type { Page } from "playwright"
import { chromium } from "playwright"

import { toArray } from "./helpers.js"
import type { SetupOpts, View, ViewInstance } from "./types.js"

export type DefineViewAction = (args: { page: Page }) => Promise<void> | void

export const defineViewFromActions = (
	maybeActionArr: DefineViewAction | DefineViewAction[],
): View => {
	return {
		setup: async (opts?: SetupOpts): Promise<ViewInstance> => {
			const actions = toArray(maybeActionArr)

			const baseURL = opts?.context?.baseURL
			if (!baseURL) {
				throw new Error(
					"Views created with defineView require options.context.baseURL to be set.",
				)
			}

			const browser = await chromium.launch()
			const context = await browser.newContext(opts?.context)
			const page = await context.newPage()

			const runActions = async (): Promise<void> => {
				for (const action of actions) {
					await action({ page })
				}
			}

			const reset = async (): Promise<void> => {
				await page.goto(baseURL)
				await runActions()
			}

			await reset()

			return {
				page,
				reset,
				close: async () => {
					await context.close()
					await browser.close()
				},
			}
		},
	}
}

export const defaultView: View = defineViewFromActions([])
