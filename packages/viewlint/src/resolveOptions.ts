import type { z } from "zod"
import { resolveRuleId } from "./helpers.js"
import type {
	BrowserOptions,
	ConfigObject,
	Options,
	Plugin,
	RuleConfig,
	RuleDefinition,
	RuleSchema,
	Scene,
	Severity,
} from "./types.js"

// ============================================================================
// Browser Options Resolution
// ============================================================================

/**
 * Fully resolved browser options with all fields required.
 * This represents the final merged state after layering defaults < config < scene overrides.
 */
export type ResolvedBrowserOptions = {
	headless: boolean
	viewport: {
		width: number
		height: number
	}
	waitUntil: "load" | "domcontentloaded" | "networkidle"
	timeoutMs: number
	disableAnimations: boolean
}

export const defaultBrowserOptions: ResolvedBrowserOptions = {
	headless: true,
	viewport: {
		width: 1280,
		height: 720,
	},
	waitUntil: "networkidle",
	timeoutMs: 30_000,
	disableAnimations: false,
}

/**
 * Merges browser options layers: defaults < base < override.
 * Used for both global config resolution and per-target scene merging.
 */
export function mergeBrowserOptions(
	base: BrowserOptions | undefined,
	override: BrowserOptions | undefined,
): ResolvedBrowserOptions {
	const merged: ResolvedBrowserOptions = {
		headless: defaultBrowserOptions.headless,
		viewport: defaultBrowserOptions.viewport,
		waitUntil: defaultBrowserOptions.waitUntil,
		timeoutMs: defaultBrowserOptions.timeoutMs,
		disableAnimations: defaultBrowserOptions.disableAnimations,
	}

	// Apply base layer
	if (base) {
		if (base.headless !== undefined) merged.headless = base.headless
		if (base.viewport !== undefined) merged.viewport = base.viewport
		if (base.waitUntil !== undefined) merged.waitUntil = base.waitUntil
		if (base.timeoutMs !== undefined) merged.timeoutMs = base.timeoutMs
		if (base.disableAnimations !== undefined)
			merged.disableAnimations = base.disableAnimations
	}

	// Apply override layer
	if (override) {
		if (override.headless !== undefined) merged.headless = override.headless
		if (override.viewport !== undefined) merged.viewport = override.viewport
		if (override.waitUntil !== undefined) merged.waitUntil = override.waitUntil
		if (override.timeoutMs !== undefined) merged.timeoutMs = override.timeoutMs
		if (override.disableAnimations !== undefined)
			merged.disableAnimations = override.disableAnimations
	}

	return merged
}

// ============================================================================
// Scene Name Validation
// ============================================================================

/**
 * Scene names must be lowercase alphanumeric with dashes.
 * This minimizes ambiguity with future parameterization and makes CLI UX predictable.
 */
const SCENE_NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

export function isValidSceneName(name: string): boolean {
	return SCENE_NAME_PATTERN.test(name)
}

// ============================================================================
// Resolved Options
// ============================================================================

export type NormalizedRuleConfig = {
	severity: Exclude<Severity, "inherit">
	options: unknown[]
}

export type ResolvedOptions = {
	plugins: Map<string, Plugin>
	ruleRegistry: Map<string, RuleDefinition>
	rules: Map<string, NormalizedRuleConfig>

	/** Global browser options resolved from config layers. */
	browser: ResolvedBrowserOptions

	/** Scenes collected from config layers. Later configs override earlier ones. */
	scenes: Map<string, Scene>
}

function getErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message
	return String(error)
}

function normalizeRuleSetting(setting: RuleConfig): {
	severity: Severity
	rawOptions: unknown[]
} {
	if (Array.isArray(setting)) {
		const [severity, ...rawOptions] = setting
		return { severity, rawOptions }
	}

	return { severity: setting, rawOptions: [] }
}

export function resolveOptions(options: Options): ResolvedOptions {
	const toConfigArray = (
		value: Options["baseConfig"] | Options["overrideConfig"],
	): ConfigObject[] => {
		if (!value) return []
		return Array.isArray(value) ? value : [value]
	}

	const configItems = [
		...toConfigArray(options.baseConfig),
		...toConfigArray(options.overrideConfig),
	]

	const plugins = new Map<string, Plugin>()
	const scenes = new Map<string, Scene>()

	// Accumulated browser options from config layers (later layers override earlier)
	let accumulatedBrowserOptions: BrowserOptions | undefined

	if (options.plugins) {
		for (const [pluginNamespace, plugin] of Object.entries(options.plugins)) {
			plugins.set(pluginNamespace, plugin)
		}
	}

	type RuleEvent = {
		ruleId: string
		setting: RuleConfig
	}

	const ruleEvents: RuleEvent[] = []

	for (const config of configItems) {
		// Collect plugins
		if (config.plugins) {
			for (const [pluginNamespace, plugin] of Object.entries(config.plugins)) {
				plugins.set(pluginNamespace, plugin)
			}
		}

		// Collect rules
		if (config.rules) {
			for (const [ruleId, setting] of Object.entries(config.rules)) {
				if (setting === undefined) {
					throw new Error(
						`Rule '${ruleId}' is configured with undefined. Use 'off' to disable a rule.`,
					)
				}
				ruleEvents.push({ ruleId, setting })
			}
		}

		// Collect browser options (layer on top of previous)
		if (config.browser) {
			accumulatedBrowserOptions = {
				...accumulatedBrowserOptions,
				...config.browser,
			}
		}

		// Collect scenes (later configs override earlier)
		if (config.scenes) {
			for (const [sceneName, scene] of Object.entries(config.scenes)) {
				if (!isValidSceneName(sceneName)) {
					throw new Error(
						`Invalid scene name '${sceneName}'. Scene names must be lowercase alphanumeric with dashes (e.g., 'logged-in-home', 'mobile-view').`,
					)
				}
				scenes.set(sceneName, scene)
			}
		}
	}

	const ruleRegistry = new Map<string, RuleDefinition>()
	for (const [pluginNamespace, plugin] of plugins.entries()) {
		const rules = plugin.rules ?? {}
		for (const [ruleName, rule] of Object.entries(rules)) {
			if (ruleName.includes("/")) {
				throw new Error(
					`Invalid rule name '${ruleName}' in plugin '${pluginNamespace}'. Rule names must not include '/'.`,
				)
			}

			ruleRegistry.set(`${pluginNamespace}/${ruleName}`, rule)
		}
	}

	const isSchemaArray = (
		value: RuleSchema,
	): value is ReadonlyArray<z.ZodTypeAny> => {
		return Array.isArray(value)
	}

	const isPlainObject = (value: unknown): value is Record<string, unknown> => {
		if (typeof value !== "object" || value === null) return false
		if (Array.isArray(value)) return false
		return Object.getPrototypeOf(value) === Object.prototype
	}

	const mergeDeep = (base: unknown, override: unknown): unknown => {
		if (override === undefined) return base
		if (base === undefined) return override

		if (isPlainObject(base) && isPlainObject(override)) {
			const merged: Record<string, unknown> = { ...base }
			for (const [key, overrideValue] of Object.entries(override)) {
				merged[key] = mergeDeep(base[key], overrideValue)
			}
			return merged
		}

		return override
	}

	const parseRuleOptions = (
		ruleId: string,
		rule: RuleDefinition,
		rawOptions: unknown[],
	): unknown[] => {
		const schema: RuleSchema | undefined = rule.meta?.schema
		const defaultOptionsRaw: unknown[] = Array.isArray(
			rule.meta?.defaultOptions,
		)
			? rule.meta?.defaultOptions
			: []

		if (!schema) {
			if (rawOptions.length > 0) {
				throw new Error(
					`Rule '${ruleId}' does not accept options, but options were provided.`,
				)
			}
			return []
		}

		if (isSchemaArray(schema)) {
			const schemaArray = schema

			if (rawOptions.length > schemaArray.length) {
				throw new Error(
					`Too many options for rule '${ruleId}'. Expected at most ${schemaArray.length} but got ${rawOptions.length}.`,
				)
			}

			return schemaArray.map((itemSchema: z.ZodTypeAny, index) => {
				const baseValue = defaultOptionsRaw[index]
				const overrideValue =
					index < rawOptions.length ? rawOptions[index] : undefined
				const mergedValue = mergeDeep(baseValue, overrideValue)

				try {
					return itemSchema.parse(mergedValue)
				} catch (error) {
					throw new Error(
						`Invalid options for rule '${ruleId}' at index ${index}. ${getErrorMessage(error)}`,
					)
				}
			})
		}

		if (rawOptions.length > 1) {
			throw new Error(
				`Too many options for rule '${ruleId}'. Expected at most 1 but got ${rawOptions.length}.`,
			)
		}

		const itemSchema: z.ZodTypeAny = schema
		const baseValue = defaultOptionsRaw[0]
		const overrideValue = rawOptions[0]
		const mergedValue = mergeDeep(baseValue, overrideValue)

		try {
			return [itemSchema.parse(mergedValue)]
		} catch (error) {
			throw new Error(
				`Invalid options for rule '${ruleId}'. ${getErrorMessage(error)}`,
			)
		}
	}

	const rules = new Map<string, NormalizedRuleConfig>()
	for (const { ruleId: rawRuleId, setting } of ruleEvents) {
		const canonicalRuleId = resolveRuleId(rawRuleId, ruleRegistry)
		const rule = ruleRegistry.get(canonicalRuleId)
		if (!rule) {
			throw new Error(`No rule with rule ID ${canonicalRuleId} found`)
		}

		const { severity, rawOptions } = normalizeRuleSetting(setting)

		const previous = rules.get(canonicalRuleId)

		const ruleDefaultSeverity = rule.meta?.severity ?? "error"

		if (severity === "inherit") {
			const inheritedSeverity = ruleDefaultSeverity
			const inheritedOptions =
				rawOptions.length > 0
					? parseRuleOptions(canonicalRuleId, rule, rawOptions)
					: previous
						? previous.options
						: parseRuleOptions(canonicalRuleId, rule, [])

			rules.set(canonicalRuleId, {
				severity: inheritedSeverity,
				options: inheritedOptions,
			})

			continue
		}

		rules.set(canonicalRuleId, {
			severity,
			options: parseRuleOptions(canonicalRuleId, rule, rawOptions),
		})
	}

	return {
		plugins,
		ruleRegistry,
		rules,
		browser: mergeBrowserOptions(undefined, accumulatedBrowserOptions),
		scenes,
	}
}
