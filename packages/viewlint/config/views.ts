import type { Page } from "playwright"
import { chromium } from "playwright"

import { toArray } from "../src/helpers.js"
import type { SetupOpts, View, ViewInstance } from "../src/types.js"

export type DefineViewAction = (args: { page: Page }) => Promise<void> | void

export const defineViewFromActions = (
	maybeActionArr: DefineViewAction | DefineViewAction[],
	opts?: {
		name?: string
	}
): View => {
	return {
		meta: {
			name: opts?.name
		},
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

			const waitForSettled = async (): Promise<void> => {
				await page.waitForLoadState("networkidle")
			}

			const runActions = async (): Promise<void> => {
				for (const action of actions) {
					await action({ page })
					await waitForSettled()
				}
			}

			const reset = async (): Promise<void> => {
				await page.goto(baseURL)
				await waitForSettled()
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

export const defaultView: View = defineViewFromActions([], { name: "default" })
