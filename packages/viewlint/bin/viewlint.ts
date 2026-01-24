#!/usr/bin/env bun

import debug from "debug"
import { runCli } from "../src/cli.js"

const argv = process.argv

// Keep this entrypoint extremely lightweight, similar to ESLint.
// We intentionally scan argv for early flags instead of doing full parse.
if (argv.includes("--init")) {
	process.stdout.write("viewlint --init: Coming soon.\n")
	process.exitCode = 0
} else if (argv.includes("--mcp")) {
	console.warn(
		"You can also run this command directly using 'npx @viewlint/mcp@latest'.",
	)

	const spawn = require("cross-spawn")

	spawn.sync("npx", ["@viewlint/mcp@latest"], {
		encoding: "utf8",
		stdio: "inherit",
	})

	process.exitCode = 0
	process.exit()
} else {
	if (argv.includes("--verbose")) {
		debug.enable("viewlint*")
	}

	process.exitCode = await runCli(argv)
}
