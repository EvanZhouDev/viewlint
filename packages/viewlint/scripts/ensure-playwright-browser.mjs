import { constants } from "node:fs"
import { access } from "node:fs/promises"

import { chromium } from "playwright"

const executablePath = chromium.executablePath()

try {
	await access(executablePath, constants.X_OK)
} catch {
	console.error("Playwright browser is not installed.")
	console.error(`Expected executable at: ${executablePath}`)
	console.error("Install browsers before running tests:")
	console.error("  npx playwright install")
	process.exit(1)
}
