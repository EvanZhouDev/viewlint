import path from "node:path"

import { findNearestViewlintConfigFile } from "./configFile.js"
import { ViewLintEngine } from "./engine.js"
import { formatterFromId } from "./formatter.js"
import { toArray } from "./helpers.js"
import { loadViewlintConfigFromFile } from "./loadConfigFile.js"
import type { ResolvedOptions } from "./resolveOptions.js"
import { resolveOptions } from "./resolveOptions.js"
import type {
	Config,
	LintResult,
	LoadedFormatter,
	Options,
	RulesConfig,
	Target,
} from "./types.js"

export class ViewLint {
	#options: Options
	#resolved: ResolvedOptions | undefined
	#engine: ViewLintEngine | undefined

	constructor(options: Options = {}) {
		this.#options = options
	}

	async #ensureInitialized(): Promise<ViewLintEngine> {
		if (this.#engine) return this.#engine

		const overrideConfigFilePath = this.#options.overrideConfigFile

		const discoveredConfigFilePath = overrideConfigFilePath
			? path.resolve(overrideConfigFilePath)
			: findNearestViewlintConfigFile()

		const discoveredConfig = discoveredConfigFilePath
			? await loadViewlintConfigFromFile(discoveredConfigFilePath)
			: undefined

		const baseConfig = this.#options.baseConfig
		const overrideConfig = this.#options.overrideConfig

		const mergedBaseConfig = [
			...toArray<Config<RulesConfig>>(baseConfig),
			...toArray<Config<RulesConfig>>(discoveredConfig),
		]

		const merged: Options = {
			...this.#options,
			baseConfig: mergedBaseConfig,
			overrideConfig,
		}

		this.#resolved = resolveOptions(merged)
		this.#engine = new ViewLintEngine(this.#resolved)
		return this.#engine
	}

	async lintTargets(targets: Target[]): Promise<LintResult[]> {
		const engine = await this.#ensureInitialized()
		return engine.lintTargets(targets)
	}

	async getResolvedOptions(): Promise<ResolvedOptions> {
		await this.#ensureInitialized()
		if (!this.#resolved) {
			throw new Error("viewlint internal error: expected resolved options")
		}
		return this.#resolved
	}

	async loadFormatter(nameOrPath?: string): Promise<LoadedFormatter> {
		return formatterFromId(nameOrPath)
	}
}

export * from "./types.js"
export { defaultView, defineViewFromActions as defineView } from "./views.js"
