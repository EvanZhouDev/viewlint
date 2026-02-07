import type { ConfigObject, Plugin } from "../src/types.js"

import type {
	ConfigWithExtends,
	ConfigWithExtendsArray,
	ExtendsElement,
	InfiniteArray,
} from "./types.js"

type DefineState = {
	plugins: Map<string, Plugin>
	output: ConfigObject[]
}

type DefineContext = {
	activeArrays: WeakSet<object>
	activeItems: WeakSet<object>
	stringStack: string[]
}

function resolveExtendsString(
	reference: string,
	plugins: Map<string, Plugin>,
): ConfigObject {
	const normalized = reference.trim()
	const lastSlashIndex = normalized.lastIndexOf("/")
	let pluginNamespace: string = ""
	let configName: string = ""

	if (lastSlashIndex === -1) {
		const candidates = [...plugins.keys()].filter((knownNamespace) => {
			return knownNamespace.endsWith(`/${reference}`)
		})

		if (candidates.length === 0) {
			throw new Error(
				`Invalid extends reference '${reference}'. Expected '<configName>' or '<pluginNamespace>/<configName>'.`,
			)
		} else if (candidates.length === 1) {
			const candidate = candidates[0]
			if (!candidate) {
				throw new Error(
					`Invalid extends reference '${reference}'. Expected '<configName>' or '<pluginNamespace>/<configName>'.`,
				)
			}
			pluginNamespace = candidate
			configName = reference
		} else if (candidates.length > 1) {
			candidates.sort()
			throw new Error(
				`Ambiguous plugin '${reference}' in extends '${reference}'. Specify with a namespace. Matches: ${candidates
					.map((candidate) => `'${candidate}'`)
					.join(", ")}.`,
			)
		}
	} else {
		const pluginRef = normalized.slice(0, lastSlashIndex).trim()
		configName = normalized.slice(lastSlashIndex + 1).trim()
		if (pluginRef.length === 0 || configName.length === 0) {
			throw new Error(
				`Invalid extends reference '${reference}'. Expected '<pluginNamespace>/<configName>'.`,
			)
		}

		if (plugins.has(pluginRef)) {
			pluginNamespace = pluginRef
		} else {
			const knownPlugins = [...plugins.keys()].sort()
			const knownPluginsMessage =
				knownPlugins.length === 0
					? "No plugins are registered."
					: `Known plugins: ${knownPlugins
							.map((name) => `'${name}'`)
							.join(", ")}.`

			throw new Error(
				`Unknown plugin referenced by extends '${reference}'. Ensure it is registered in plugins. ${knownPluginsMessage}`,
			)
		}
	}

	const plugin = plugins.get(pluginNamespace)
	if (!plugin) {
		throw new Error(
			`Unknown plugin '${pluginNamespace}' referenced by extends '${reference}'. Ensure it is registered in plugins.`,
		)
	}

	if (!plugin.configs)
		throw new Error(`No configuration found in plugin '${pluginNamespace}'.`)

	const config = plugin.configs[configName]
	if (!config) {
		const availableConfigs = Object.keys(plugin.configs).sort()
		const availableConfigsMessage =
			availableConfigs.length === 0
				? "No configs are available in this plugin."
				: `Available configs: ${availableConfigs
						.map((name) => `'${name}'`)
						.join(", ")}.`

		throw new Error(
			`Unknown config '${configName}' in plugin '${pluginNamespace}' (extends '${reference}'). ${availableConfigsMessage}`,
		)
	}

	return config
}

function applyExtendsEntry(
	entry: ExtendsElement,
	state: DefineState,
	context: DefineContext,
): void {
	if (typeof entry === "string") {
		const normalized = entry.trim()
		const cycleIndex = context.stringStack.indexOf(normalized)
		if (cycleIndex !== -1) {
			const chain = [...context.stringStack.slice(cycleIndex), normalized].join(
				" -> ",
			)
			throw new Error(`Circular extends detected: ${chain}`)
		}

		context.stringStack.push(normalized)
		try {
			const resolved = resolveExtendsString(normalized, state.plugins)
			applyConfig(resolved, state, context)
		} finally {
			context.stringStack.pop()
		}

		return
	}

	applyConfig(entry, state, context)
}

function applyConfig(
	config: InfiniteArray<ConfigWithExtends>,
	state: DefineState,
	context: DefineContext,
): void {
	if (Array.isArray(config)) {
		if (context.activeArrays.has(config)) {
			throw new Error(
				"Circular extends detected: a config array was recursively extended.",
			)
		}
		context.activeArrays.add(config)

		try {
			for (const item of config) {
				applyConfig(item, state, context)
			}
		} finally {
			context.activeArrays.delete(config)
		}

		return
	}

	if (context.activeItems.has(config)) {
		throw new Error(
			"Circular extends detected: a config item was recursively extended.",
		)
	}
	context.activeItems.add(config)

	try {
		if (config.plugins) {
			for (const [pluginNamespace, plugin] of Object.entries(config.plugins)) {
				state.plugins.set(pluginNamespace, plugin)
			}
		}

		if (config.extends) {
			for (const extendsEntry of config.extends) {
				applyExtendsEntry(extendsEntry, state, context)
			}
		}

		const { extends: _extends, ...rest } = config
		const hasEntries = (value: object | undefined): boolean => {
			if (!value) return false
			return Object.keys(value).length > 0
		}

		if (
			hasEntries(rest.plugins) ||
			hasEntries(rest.rules) ||
			hasEntries(rest.options) ||
			hasEntries(rest.views) ||
			hasEntries(rest.scopes)
		) {
			state.output.push(rest)
		}
	} finally {
		context.activeItems.delete(config)
	}
}

export function defineConfig(
	...configs: ConfigWithExtendsArray
): ConfigObject[] {
	const state: DefineState = {
		plugins: new Map(),
		output: [],
	}

	const context: DefineContext = {
		activeArrays: new WeakSet(),
		activeItems: new WeakSet(),
		stringStack: [],
	}

	for (const config of configs) {
		applyConfig(config, state, context)
	}

	return state.output
}

export { findNearestViewlintConfigFile } from "../src/configFile.js"
export { defaultView, defineViewFromActions } from "./views.js"
