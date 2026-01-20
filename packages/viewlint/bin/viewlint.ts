#!/usr/bin/env bun

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
	// Align with ESLint: enable debug logging before requiring most modules.
	if (argv.includes("--verbose")) {
		// Enable all viewlint debug namespaces.
		// Note: keep `debug` dependency implicit (already in dependency graph).
		const debug = await import("debug")
		debug.default.enable("viewlint*")
	}

	process.exitCode = await runCli(argv)
}
