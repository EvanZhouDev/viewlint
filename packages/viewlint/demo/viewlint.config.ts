import { defineConfig } from "../config/index.js"
import viewlint from "../rules/index.js"
import { demoPlugin } from "./lint-google.js"

export default defineConfig([
	viewlint.configs.recommended,
	{
		plugins: {
			demoPlugin,
		},
		rules: {
			"demoPlugin/title-contains": ["warn", "Googlee"],
		},
	},
])
