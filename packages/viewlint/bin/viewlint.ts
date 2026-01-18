#!/usr/bin/env bun

import { runCli } from "../src/cli.js"

const argv = process.argv

// Keep this entrypoint extremely lightweight, similar to ESLint.
// We intentionally scan argv for early flags instead of doing full parse.
if (argv.includes("--init")) {
	process.stdout.write("viewlint --init: Coming soon.\n")
	process.exitCode = 0
} else if (argv.includes("--mcp")) {
	process.stdout.write("viewlint --mcp: Coming soon.\n")
	process.exitCode = 0
} else {
	process.exitCode = await runCli(argv)
}
