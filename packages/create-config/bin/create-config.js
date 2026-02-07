#!/usr/bin/env node

import { run } from "../dist/index.js"

try {
	const exitCode = await run(process.argv)
	process.exitCode = exitCode
} catch (error) {
	const message = error instanceof Error ? error.message : String(error)
	process.stderr.write(`${message}\n`)
	process.exitCode = 1
}
