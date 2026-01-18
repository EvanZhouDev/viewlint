import type { Plugin, RuleDefinition, RuleSchema } from "@repo/ezviewlint"

const rules: Record<string, RuleDefinition<RuleSchema | undefined>> = {}

const recommendedPlugins: Record<string, Plugin> = {}
const allPlugins: Record<string, Plugin> = {}

const plugin = {
	meta: {
		name: "@viewlint/rules",
		docs: {

		}
	},
	rules,
	configs: {
		recommended: {
			rules: {},
			plugins: recommendedPlugins,
		},
		all: {
			rules: {},
			plugins: allPlugins,
		},
	},
}

recommendedPlugins.rules = plugin
allPlugins.rules = plugin

export default plugin
