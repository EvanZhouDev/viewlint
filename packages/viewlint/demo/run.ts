import { defineConfig } from "../config/index.js"
import { ViewLint } from "../src/index.js"

const viewlint = new ViewLint({
	baseConfig: defineConfig([
		{
			plugins: {
				demoPlugin: (await import("./lint-google.js")).demoPlugin,
			},
			rules: {
				"demoPlugin/title-contains": ["inherit", "Googlee"],
			},
		},
	]),
})

const results = await viewlint.lintUrls("https://www.google.com")

const formatter = await viewlint.loadFormatter("stylish")
const output = await formatter.format(results)

console.log(output)
