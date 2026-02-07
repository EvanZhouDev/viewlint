#!/usr/bin/env bun

import debug from "debug"
import { createDefaultBinDeps, runBin } from "../src/binEntry.js"
import { runCli } from "../src/cli.js"

const argv = process.argv

const spawn = require("cross-spawn")

process.exitCode = await runBin(
	argv,
	createDefaultBinDeps({
		spawnSync: spawn.sync,
		runCli,
		enableDebug: debug.enable,
	}),
)
