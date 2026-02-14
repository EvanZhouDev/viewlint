import {
	installDependencies,
	type SpawnSyncLike,
} from "./installDependencies.js"
import { writePackageJsonIfMissing } from "./packageJson.js"
import type { SetupPlan } from "./promptForSetupPlan.js"
import {
	findExistingViewlintConfigFile,
	writeViewlintConfigFile,
} from "./viewlintConfigFile.js"

export type ApplySetupPlanResult = {
	exitCode: number
	configFilePath: string | null
	existingConfigFilePath: string | null
	createdPackageJsonPath: string | null
	installed: boolean
}

export async function applySetupPlan(opts: {
	cwd: string
	plan: SetupPlan
	runtime?: {
		platform?: NodeJS.Platform
		spawnSync?: SpawnSyncLike
		stat?: (filePath: string) => Promise<{ isFile(): boolean }>
		writeFile?: (
			filePath: string,
			contents: string,
			encoding: "utf8",
		) => Promise<void>
	}
}): Promise<ApplySetupPlanResult> {
	const existingConfigFilePath = await findExistingViewlintConfigFile({
		cwd: opts.cwd,
		runtime: opts.runtime ? { stat: opts.runtime.stat } : undefined,
	})

	if (existingConfigFilePath) {
		return {
			exitCode: 1,
			configFilePath: null,
			existingConfigFilePath,
			createdPackageJsonPath: null,
			installed: false,
		}
	}

	const configFilePath = await writeViewlintConfigFile({
		cwd: opts.cwd,
		preset: opts.plan.preset,
		language: opts.plan.language,
		runtime: opts.runtime ? { writeFile: opts.runtime.writeFile } : undefined,
	})

	if (!opts.plan.installNow) {
		return {
			exitCode: 0,
			configFilePath,
			existingConfigFilePath: null,
			createdPackageJsonPath: null,
			installed: false,
		}
	}

	let createdPackageJsonPath: string | null = null
	if (opts.plan.createPackageJson) {
		const created = await writePackageJsonIfMissing({
			cwd: opts.cwd,
			runtime: opts.runtime
				? {
						stat: opts.runtime.stat,
						writeFile: opts.runtime.writeFile,
					}
				: undefined,
		})
		createdPackageJsonPath = created?.filePath ?? null
	}

	const packageManager = opts.plan.packageManager
	if (!packageManager) {
		return {
			exitCode: 1,
			configFilePath,
			existingConfigFilePath: null,
			createdPackageJsonPath,
			installed: false,
		}
	}

	const installExitCode = await installDependencies({
		cwd: opts.cwd,
		packageManager,
		dependencies: opts.plan.dependencies,
		runtime: opts.runtime
			? {
					platform: opts.runtime.platform,
					spawnSync: opts.runtime.spawnSync,
					stat: opts.runtime.stat,
				}
			: undefined,
	})

	return {
		exitCode: installExitCode,
		configFilePath,
		existingConfigFilePath: null,
		createdPackageJsonPath,
		installed: installExitCode === 0,
	}
}
