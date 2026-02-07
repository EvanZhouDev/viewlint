import viewlint from "@viewlint/rules"
import { chromium } from "playwright"
import type { SetupOpts, ViewInstance } from "viewlint"
import { defineConfig, defineViewFromActions } from "viewlint/config"

// import { demoPlugin } from "./lint-google.js"

export default defineConfig([
	viewlint.configs.all,
	{
		views: {
			dumbSetup: defineViewFromActions([
				async ({ page }) => {
					await page.goto("/")
					await page.getByLabel("Job Number").fill("17692")
					await page.getByLabel("Username").fill("evanzhou")
					await page.getByLabel("Password").fill("Yearbookavenue123")
					await page.locator("text=Let's Go!").click()
					await page.waitForLoadState("networkidle")
				},
			]),
			loggedin: {
				setup: async (opts?: SetupOpts): Promise<ViewInstance> => {
					const browser = await chromium.launch()
					const context = await browser.newContext(opts?.context)
					const page = await context.newPage()

					await page.goto("/")
					await page.getByLabel("Job Number").fill("17692")
					await page.getByLabel("Username").fill("evanzhou")
					await page.getByLabel("Password").fill("Yearbookavenue123")
					await page.locator("text=Let's Go!").click()
					await page.waitForLoadState("networkidle")

					return {
						page,
						reset: async () => {
							await page.goto("/")
						},
						close: async () => {
							await context.close()
							await browser.close()
						},
					}
				},
			},
		},
		options: {
			prod: [
				{
					context: {
						baseURL:
							"https://yearbookavenue.jostens.com/yto/login?redirect=/yto/home/main",
					},
				},
			],
			local: [
				{
					context: {
						baseURL: "http://localhost:3000",
					},
				},
			],
		},
		scopes: {
			meaningfulBook: [
				{
					getLocator: ({ page }) => {
						return page.locator("text=A Meaningful Book")
					},
				},
			],
		},
	},
])
