#!/usr/bin/env bun

import debug from "debug"
import { createDefaultBinDeps, runBin } from "../src/binEntry.js"
import { runCli } from "../src/cli.js"
import { sync } from "cross-spawn"

const argv = process.argv

process.exitCode = await runBin(
	argv,
	createDefaultBinDeps({
		spawnSync: sync,
		runCli,
		enableDebug: debug.enable,
	}),
)
