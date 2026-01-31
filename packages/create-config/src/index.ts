import { applySetupPlan } from "./applySetupPlan.js"
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

	if (!plan.installNow) {
		process.stdout.write(
			`Next: install ${plan.dependencies.join(", ")} and run viewlint.\n`,
		)
	}

	return result.exitCode
}
