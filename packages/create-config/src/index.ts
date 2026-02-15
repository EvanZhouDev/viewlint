import * as p from "@clack/prompts"

import { applySetupPlan } from "./applySetupPlan.js"
import {
	formatPlaywrightChromiumInstallCommand,
	installPlaywrightChromium,
	isPlaywrightChromiumInstalled,
} from "./playwrightChromium.js"
import type { SetupPlan } from "./promptForSetupPlan.js"
import { promptForSetupPlan } from "./promptForSetupPlan.js"
import { findExistingViewlintConfigFile } from "./viewlintConfigFile.js"

type PromptForSetupPlan = (opts: { cwd: string }) => Promise<SetupPlan | null>

export async function run(_argv: string[]): Promise<number> {
	// argv reserved for future non-interactive flags
	return runInternal({
		cwd: process.cwd(),
		prompt: promptForSetupPlan,
	})
}

export async function runInternal(opts: {
	cwd: string
	prompt: PromptForSetupPlan
}): Promise<number> {
	const existingConfigFile = await findExistingViewlintConfigFile({
		cwd: opts.cwd,
	})
	if (existingConfigFile) {
		process.stderr.write(
			`A ViewLint config file already exists at ${existingConfigFile}. Remove it and re-run this initializer.\n`,
		)
		return 1
	}

	const plan = await opts.prompt({ cwd: opts.cwd })
	if (plan === null) return 0

	const result = await applySetupPlan({ cwd: opts.cwd, plan })

	if (result.existingConfigFilePath) {
		process.stderr.write(
			`A ViewLint config file already exists at ${result.existingConfigFilePath}. Remove it and re-run this initializer.\n`,
		)
		return result.exitCode
	}

	if (result.createdPackageJsonPath) {
		process.stdout.write(`Created ${result.createdPackageJsonPath}\n`)
	}
	if (result.configFilePath) {
		process.stdout.write(`Created ${result.configFilePath}\n`)
	}

	if (result.exitCode === 0) {
		const chromiumInstalled = await isPlaywrightChromiumInstalled({
			cwd: opts.cwd,
		})

		if (!chromiumInstalled) {
			const installCommand = formatPlaywrightChromiumInstallCommand({
				packageManager: plan.packageManager,
			})

			const chromiumInstallChoiceRaw = await p.select({
				message:
					"Playwright Chromium is not installed. ViewLint will not work until Chromium is installed. What would you like to do?",
				options: [
					{
						value: "install",
						label: "Install Chromium now (Recommended)",
						hint: installCommand,
					},
					{
						value: "later",
						label: "I'll install Chromium myself later",
					},
				],
				initialValue: "install",
			})

			if (p.isCancel(chromiumInstallChoiceRaw)) {
				p.cancel("Setup cancelled.")
				return 0
			}

			if (chromiumInstallChoiceRaw === "install") {
				const chromiumInstallExitCode = await installPlaywrightChromium({
					cwd: opts.cwd,
					packageManager: plan.packageManager,
				})
				if (chromiumInstallExitCode !== 0) {
					process.stderr.write(
						"Failed to install Playwright Chromium. ViewLint will not work until Chromium is installed.\n",
					)
					process.stderr.write(
						`Run '${installCommand}' to install it manually.\n`,
					)
					return chromiumInstallExitCode
				}
			} else if (chromiumInstallChoiceRaw === "later") {
				process.stdout.write(
					"Skipping Playwright Chromium install. ViewLint will not work until Chromium is installed.\n",
				)
				process.stdout.write(`Run '${installCommand}' when you're ready.\n`)
			} else {
				throw new Error(
					`Unexpected chromium install choice: ${String(chromiumInstallChoiceRaw)}`,
				)
			}
		}
	}

	if (!plan.installNow) {
		process.stdout.write(
			`Next: install ${plan.dependencies.join(", ")} and run viewlint.\n`,
		)
	}

	return result.exitCode
}
