import { describe, expect, it } from "vitest"
import { defineConfig } from "../config/index.js"
import type { ConfigWithExtends } from "../config/types.js"
import type {
	ConfigObject,
	Plugin,
	RuleDefinition,
	Scope,
	SetupOpts,
	View,
} from "../src/types.js"

// Helper to create a plugin with configs
function createPlugin(options?: {
	rules?: Record<string, RuleDefinition>
	configs?: Record<string, ConfigObject>
}): Plugin {
	return {
		rules: options?.rules,
		configs: options?.configs,
	}
}

// Helper to create a minimal rule definition
function createRule(): RuleDefinition {
	return {
		run: async () => {},
	}
}

// Helper to create a valid View
function createView(): View {
	const setup: View["setup"] = async () => {
		throw new Error("createView setup should not be called in defineConfig tests")
	}

	return {
		setup,
	}
}

// Helper to create a valid Scope
function createScope(): Scope {
	const getLocator: Scope["getLocator"] = async () => {
		throw new Error(
			"createScope getLocator should not be called in defineConfig tests",
		)
	}

	return {
		getLocator,
	}
}

// Helper to create valid SetupOpts
function createSetupOpts(): SetupOpts {
	return {
		meta: { name: "test" },
	}
}

describe("defineConfig", () => {
	describe("Basic Behavior", () => {
		it("returns empty array when no configs", () => {
			const result = defineConfig()
			expect(result).toEqual([])
		})

		it("returns single config as array", () => {
			const result = defineConfig({ rules: { "my-rule": "error" } })
			expect(result).toEqual([{ rules: { "my-rule": "error" } }])
		})

		it("returns multiple configs in order", () => {
			const result = defineConfig(
				{ rules: { "rule-1": "error" } },
				{ rules: { "rule-2": "warn" } },
				{ rules: { "rule-3": "off" } },
			)
			expect(result).toEqual([
				{ rules: { "rule-1": "error" } },
				{ rules: { "rule-2": "warn" } },
				{ rules: { "rule-3": "off" } },
			])
		})

		it("flattens nested arrays", () => {
			const result = defineConfig({ rules: { "rule-1": "error" } }, [
				{ rules: { "rule-2": "warn" } },
				{ rules: { "rule-3": "off" } },
			])
			expect(result).toEqual([
				{ rules: { "rule-1": "error" } },
				{ rules: { "rule-2": "warn" } },
				{ rules: { "rule-3": "off" } },
			])
		})

		it("flattens deeply nested arrays recursively", () => {
			const result = defineConfig({ rules: { "rule-1": "error" } }, [
				[{ rules: { "rule-2": "warn" } }],
				[[[{ rules: { "rule-3": "off" } }]]],
			])
			expect(result).toEqual([
				{ rules: { "rule-1": "error" } },
				{ rules: { "rule-2": "warn" } },
				{ rules: { "rule-3": "off" } },
			])
		})
	})

	describe("Output Filtering", () => {
		it("excludes empty configs", () => {
			const result = defineConfig({}, { rules: { "my-rule": "error" } }, {})
			expect(result).toEqual([{ rules: { "my-rule": "error" } }])
		})

		it("excludes configs with only extends", () => {
			const plugin = createPlugin({
				configs: { recommended: { rules: { "plugin-rule": "error" } } },
			})
			const result = defineConfig(
				{ plugins: { "my-plugin": plugin } },
				{ extends: ["my-plugin/recommended"] },
			)
			// The extends-only config should not appear, but its resolved config should
			expect(result).toEqual([
				{ plugins: { "my-plugin": plugin } },
				{ rules: { "plugin-rule": "error" } },
			])
		})

		it("includes configs with plugins", () => {
			const plugin = createPlugin()
			const result = defineConfig({ plugins: { "my-plugin": plugin } })
			expect(result).toEqual([{ plugins: { "my-plugin": plugin } }])
		})

		it("includes configs with rules", () => {
			const result = defineConfig({ rules: { "my-rule": "error" } })
			expect(result).toEqual([{ rules: { "my-rule": "error" } }])
		})

		it("includes configs with options", () => {
			const opts = createSetupOpts()
			const result = defineConfig({ options: { someSetting: opts } })
			expect(result).toEqual([{ options: { someSetting: opts } }])
		})

		it("includes configs with views", () => {
			const view = createView()
			const result = defineConfig({ views: { typescript: view } })
			expect(result).toEqual([{ views: { typescript: view } }])
		})

		it("includes configs with scopes", () => {
			const scope = createScope()
			const result = defineConfig({ scopes: { source: scope } })
			expect(result).toEqual([{ scopes: { source: scope } }])
		})

		it("strips extends field from output", () => {
			const plugin = createPlugin({
				configs: { recommended: { rules: { "plugin-rule": "error" } } },
			})
			const result = defineConfig({
				plugins: { "my-plugin": plugin },
				rules: { "my-rule": "warn" },
				extends: ["my-plugin/recommended"],
			})
			// Output should not have extends field
			result.forEach((config) => {
				expect(config).not.toHaveProperty("extends")
			})
		})

		it("excludes configs with empty plugins object", () => {
			const result = defineConfig(
				{ plugins: {} },
				{ rules: { "my-rule": "error" } },
			)
			expect(result).toEqual([{ rules: { "my-rule": "error" } }])
		})

		it("excludes configs with empty rules object", () => {
			const opts = createSetupOpts()
			const result = defineConfig({ rules: {} }, { options: { setting: opts } })
			expect(result).toEqual([{ options: { setting: opts } }])
		})
	})

	describe("Plugin Collection", () => {
		it("collects plugins from configs", () => {
			const plugin = createPlugin({
				configs: { recommended: { rules: { "plugin-rule": "error" } } },
			})
			const result = defineConfig(
				{ plugins: { "my-plugin": plugin } },
				{ extends: ["my-plugin/recommended"] },
			)
			expect(result).toHaveLength(2)
			expect(result[1]).toEqual({ rules: { "plugin-rule": "error" } })
		})

		it("later plugins override earlier with same namespace", () => {
			const plugin1 = createPlugin({
				configs: { recommended: { rules: { "plugin-rule": "error" } } },
			})
			const plugin2 = createPlugin({
				configs: { recommended: { rules: { "plugin-rule": "warn" } } },
			})
			const result = defineConfig(
				{ plugins: { "my-plugin": plugin1 } },
				{ plugins: { "my-plugin": plugin2 } },
				{ extends: ["my-plugin/recommended"] },
			)
			// Should use plugin2's config
			expect(result[2]).toEqual({ rules: { "plugin-rule": "warn" } })
		})

		it("plugins available for subsequent extends", () => {
			const plugin = createPlugin({
				configs: { recommended: { rules: { "plugin-rule": "error" } } },
			})
			const result = defineConfig(
				{ plugins: { "my-plugin": plugin } },
				{ extends: ["my-plugin/recommended"] },
			)
			expect(result).toHaveLength(2)
			expect(result[1]).toEqual({ rules: { "plugin-rule": "error" } })
		})
	})

	describe("String Extends - Short Form", () => {
		it("resolves short form when plugin namespace ends with config name", () => {
			// Short form looks for plugin namespaces ending with /<configName>
			const plugin = createPlugin({
				configs: { recommended: { rules: { "plugin-rule": "error" } } },
			})
			// Plugin namespace must end with /recommended for short form "recommended" to work
			const result = defineConfig(
				{ plugins: { "@scope/recommended": plugin } },
				{ extends: ["recommended"] },
			)
			expect(result).toHaveLength(2)
			expect(result[1]).toEqual({ rules: { "plugin-rule": "error" } })
		})

		it("throws on no matching plugin namespace", () => {
			const plugin = createPlugin({
				configs: { recommended: { rules: { "plugin-rule": "error" } } },
			})
			// Plugin namespace "my-plugin" doesn't end with /recommended
			expect(() =>
				defineConfig(
					{ plugins: { "my-plugin": plugin } },
					{ extends: ["recommended"] },
				),
			).toThrow(
				"Invalid extends reference 'recommended'. Expected '<configName>' or '<pluginNamespace>/<configName>'.",
			)
		})

		it("throws on ambiguous matches with sorted matches", () => {
			const plugin1 = createPlugin({
				configs: { recommended: { rules: { rule1: "error" } } },
			})
			const plugin2 = createPlugin({
				configs: { recommended: { rules: { rule2: "error" } } },
			})
			const plugin3 = createPlugin({
				configs: { recommended: { rules: { rule3: "error" } } },
			})
			// Multiple plugin namespaces ending with /recommended
			expect(() =>
				defineConfig(
					{
						plugins: {
							"z/recommended": plugin1,
							"a/recommended": plugin2,
							"m/recommended": plugin3,
						},
					},
					{ extends: ["recommended"] },
				),
			).toThrow(
				"Ambiguous plugin 'recommended' in extends 'recommended'. Specify with a namespace. Matches: 'a/recommended', 'm/recommended', 'z/recommended'.",
			)
		})
	})

	describe("String Extends - Fully Qualified", () => {
		it("resolves fully qualified form", () => {
			const plugin = createPlugin({
				configs: { recommended: { rules: { "plugin-rule": "error" } } },
			})
			const result = defineConfig(
				{ plugins: { "my-plugin": plugin } },
				{ extends: ["my-plugin/recommended"] },
			)
			expect(result).toHaveLength(2)
			expect(result[1]).toEqual({ rules: { "plugin-rule": "error" } })
		})

		it("throws on unknown plugin", () => {
			const plugin = createPlugin({
				configs: { recommended: { rules: { "plugin-rule": "error" } } },
			})
			expect(() =>
				defineConfig(
					{ plugins: { "my-plugin": plugin } },
					{ extends: ["unknown-plugin/recommended"] },
				),
			).toThrow(
				/Unknown plugin referenced by extends 'unknown-plugin\/recommended'/,
			)
		})

		it("includes known plugins list in unknown plugin error", () => {
			const plugin = createPlugin({
				configs: { recommended: { rules: { "plugin-rule": "error" } } },
			})
			expect(() =>
				defineConfig(
					{ plugins: { "my-plugin": plugin } },
					{ extends: ["unknown-plugin/recommended"] },
				),
			).toThrow(/my-plugin/)
		})

		it("throws on plugin with no configs", () => {
			const plugin = createPlugin({
				rules: { "some-rule": createRule() },
			})
			expect(() =>
				defineConfig(
					{ plugins: { "my-plugin": plugin } },
					{ extends: ["my-plugin/recommended"] },
				),
			).toThrow("No configuration found in plugin 'my-plugin'.")
		})

		it("throws on unknown config in plugin", () => {
			const plugin = createPlugin({
				configs: { strict: { rules: { "plugin-rule": "error" } } },
			})
			expect(() =>
				defineConfig(
					{ plugins: { "my-plugin": plugin } },
					{ extends: ["my-plugin/recommended"] },
				),
			).toThrow(/Unknown config 'recommended' in plugin 'my-plugin'/)
		})

		it("includes available configs list in unknown config error", () => {
			const plugin = createPlugin({
				configs: {
					strict: { rules: { rule1: "error" } },
					relaxed: { rules: { rule2: "warn" } },
				},
			})
			expect(() =>
				defineConfig(
					{ plugins: { "my-plugin": plugin } },
					{ extends: ["my-plugin/recommended"] },
				),
			).toThrow(/strict|relaxed/)
		})

		it("throws on invalid format with empty plugin namespace", () => {
			expect(() => defineConfig({ extends: ["/recommended"] })).toThrow(
				"Invalid extends reference '/recommended'. Expected '<pluginNamespace>/<configName>'.",
			)
		})

		it("throws on invalid format with empty config name", () => {
			const plugin = createPlugin({
				configs: { recommended: { rules: { rule: "error" } } },
			})
			expect(() =>
				defineConfig(
					{ plugins: { "my-plugin": plugin } },
					{ extends: ["my-plugin/"] },
				),
			).toThrow(
				"Invalid extends reference 'my-plugin/'. Expected '<pluginNamespace>/<configName>'.",
			)
		})

		it("throws on invalid format with just slash", () => {
			expect(() => defineConfig({ extends: ["/"] })).toThrow(
				"Invalid extends reference '/'. Expected '<pluginNamespace>/<configName>'.",
			)
		})
	})

	describe("Extends Processing Order", () => {
		it("plugins registered before extends processed", () => {
			const plugin = createPlugin({
				configs: { recommended: { rules: { "plugin-rule": "error" } } },
			})
			// Plugin and extends in same config - plugin should be available
			const result = defineConfig({
				plugins: { "my-plugin": plugin },
				extends: ["my-plugin/recommended"],
				rules: { "my-rule": "warn" },
			})
			// Should have: extended config, then current config
			expect(result).toHaveLength(2)
			expect(result[0]).toEqual({ rules: { "plugin-rule": "error" } })
			expect(result[1]).toEqual({
				plugins: { "my-plugin": plugin },
				rules: { "my-rule": "warn" },
			})
		})

		it("extends processed before current config added", () => {
			const plugin = createPlugin({
				configs: { recommended: { rules: { "plugin-rule": "error" } } },
			})
			const result = defineConfig({
				plugins: { "my-plugin": plugin },
				extends: ["my-plugin/recommended"],
				rules: { "my-rule": "warn" },
			})
			// Extended config should come first
			expect(result[0]).toEqual({ rules: { "plugin-rule": "error" } })
			// Current config should come after
			expect(result[1]).toEqual({
				plugins: { "my-plugin": plugin },
				rules: { "my-rule": "warn" },
			})
		})

		it("multiple extends processed in order", () => {
			const plugin = createPlugin({
				configs: {
					first: { rules: { rule1: "error" } },
					second: { rules: { rule2: "warn" } },
					third: { rules: { rule3: "off" } },
				},
			})
			const result = defineConfig({
				plugins: { "my-plugin": plugin },
				extends: ["my-plugin/first", "my-plugin/second", "my-plugin/third"],
			})
			expect(result[0]).toEqual({ rules: { rule1: "error" } })
			expect(result[1]).toEqual({ rules: { rule2: "warn" } })
			expect(result[2]).toEqual({ rules: { rule3: "off" } })
		})
	})

	describe("Circular Detection", () => {
		it("detects string reference cycles", () => {
			const pluginAConfig: ConfigWithExtends = {
				plugins: {},
			}
			const pluginBConfig: ConfigWithExtends = {
				extends: ["pluginA/config"],
			}
			const pluginA = createPlugin({
				configs: {
					config: pluginAConfig,
				},
			})
			// Create a plugin that extends another which extends back
			const pluginB = createPlugin({
				configs: {
					config: pluginBConfig,
				},
			})
			// Update pluginA to extend pluginB
			pluginAConfig.extends = ["pluginB/config"]

			expect(() =>
				defineConfig(
					{ plugins: { pluginA, pluginB } },
					{ extends: ["pluginA/config"] },
				),
			).toThrow(/Circular extends detected:/)
		})

		it("shows cycle chain in error message", () => {
			const pluginAConfig: ConfigWithExtends = {}
			const pluginBConfig: ConfigWithExtends = {}
			const pluginA = createPlugin({
				configs: { config: pluginAConfig },
			})
			const pluginB = createPlugin({
				configs: { config: pluginBConfig },
			})
			// A -> B -> A
			pluginAConfig.extends = ["pluginB/config"]
			pluginBConfig.extends = ["pluginA/config"]

			expect(() =>
				defineConfig(
					{ plugins: { pluginA, pluginB } },
					{ extends: ["pluginA/config"] },
				),
			).toThrow(/pluginA\/config.*->.*pluginB\/config.*->.*pluginA\/config/)
		})

		it("detects array reference cycles", () => {
			// Create an array that will be extended recursively as an inline extends element
			const cyclicArray: ConfigWithExtends[] = []
			// The array contains a config that has an extends array containing the same array
			// This creates: cyclicArray -> config -> extends -> [cyclicArray] -> cyclicArray (cycle!)
			cyclicArray.push({ rules: { rule: "error" } })

			// Create a config whose extends contains cyclicArray as an inline array element
			// When the array is processed, it will try to extend itself
			const wrapperConfig: ConfigWithExtends = {
				extends: [cyclicArray],
			}
			// Now make cyclicArray extend itself indirectly through an inline config
			cyclicArray.push({ extends: [cyclicArray] })

			// Processing order:
			// 1. Process wrapperConfig
			// 2. Process extends[0] = cyclicArray (array added to activeArrays)
			// 3. Process cyclicArray[0] = { rules: { rule: "error" } } (item added to activeItems)
			// 4. Process cyclicArray[1] = { extends: [cyclicArray] } (item added to activeItems)
			// 5. Process extends[0] = cyclicArray -> CYCLE! (cyclicArray is in activeArrays)
			expect(() => defineConfig(wrapperConfig)).toThrow(
				"Circular extends detected: a config array was recursively extended.",
			)
		})

		it("detects object reference cycles", () => {
			const config: ConfigWithExtends = { rules: { rule: "error" } }
			config.extends = [config]

			expect(() => defineConfig(config)).toThrow(
				"Circular extends detected: a config item was recursively extended.",
			)
		})

		it("handles complex nested cycles", () => {
			const pluginAConfig: ConfigWithExtends = {}
			const pluginBConfig: ConfigWithExtends = {}
			const pluginCConfig: ConfigWithExtends = {}

			const pluginA = createPlugin({ configs: { config: pluginAConfig } })
			const pluginB = createPlugin({ configs: { config: pluginBConfig } })
			const pluginC = createPlugin({ configs: { config: pluginCConfig } })

			// A -> B -> C -> A
			pluginAConfig.extends = ["pluginB/config"]
			pluginBConfig.extends = ["pluginC/config"]
			pluginCConfig.extends = ["pluginA/config"]

			expect(() =>
				defineConfig(
					{ plugins: { pluginA, pluginB, pluginC } },
					{ extends: ["pluginA/config"] },
				),
			).toThrow(/Circular extends detected:/)
		})

		it("allows same config to be extended multiple times non-circularly", () => {
			const pluginAConfig: ConfigWithExtends = {
				extends: ["shared/shared"],
			}
			const pluginBConfig: ConfigWithExtends = {
				extends: ["shared/shared"],
			}
			const sharedPlugin = createPlugin({
				configs: { shared: { rules: { "shared-rule": "error" } } },
			})
			const pluginA = createPlugin({
				configs: { config: pluginAConfig },
			})
			const pluginB = createPlugin({
				configs: { config: pluginBConfig },
			})

			// Both A and B extend shared - this is NOT circular
			const result = defineConfig(
				{ plugins: { shared: sharedPlugin, pluginA, pluginB } },
				{ extends: ["pluginA/config", "pluginB/config"] },
			)
			// Should work fine, shared config appears twice
			expect(
				result.filter((c) => c.rules?.["shared-rule"] === "error"),
			).toHaveLength(2)
		})
	})

	describe("Inline Extends", () => {
		it("processes inline config objects", () => {
			const result = defineConfig({
				extends: [{ rules: { "inline-rule": "error" } }],
				rules: { "my-rule": "warn" },
			})
			expect(result).toHaveLength(2)
			expect(result[0]).toEqual({ rules: { "inline-rule": "error" } })
			expect(result[1]).toEqual({ rules: { "my-rule": "warn" } })
		})

		it("processes inline arrays", () => {
			const result = defineConfig({
				extends: [
					[{ rules: { rule1: "error" } }, { rules: { rule2: "warn" } }],
				],
				rules: { "my-rule": "off" },
			})
			expect(result).toHaveLength(3)
			expect(result[0]).toEqual({ rules: { rule1: "error" } })
			expect(result[1]).toEqual({ rules: { rule2: "warn" } })
			expect(result[2]).toEqual({ rules: { "my-rule": "off" } })
		})

		it("nested inline configs work correctly", () => {
			const result = defineConfig({
				extends: [
					{
						extends: [{ rules: { "deeply-nested": "error" } }],
						rules: { nested: "warn" },
					},
				],
				rules: { "my-rule": "off" },
			})
			expect(result).toHaveLength(3)
			expect(result[0]).toEqual({ rules: { "deeply-nested": "error" } })
			expect(result[1]).toEqual({ rules: { nested: "warn" } })
			expect(result[2]).toEqual({ rules: { "my-rule": "off" } })
		})

		it("inline configs can reference plugins from parent", () => {
			const plugin = createPlugin({
				configs: { recommended: { rules: { "plugin-rule": "error" } } },
			})
			const result = defineConfig({
				plugins: { "my-plugin": plugin },
				extends: [
					{
						extends: ["my-plugin/recommended"],
						rules: { nested: "warn" },
					},
				],
				rules: { "my-rule": "off" },
			})
			expect(result).toHaveLength(3)
			expect(result[0]).toEqual({ rules: { "plugin-rule": "error" } })
			expect(result[1]).toEqual({ rules: { nested: "warn" } })
			expect(result[2]).toEqual({
				plugins: { "my-plugin": plugin },
				rules: { "my-rule": "off" },
			})
		})

		it("mixes inline and string extends", () => {
			const plugin = createPlugin({
				configs: { recommended: { rules: { "plugin-rule": "error" } } },
			})
			const result = defineConfig({
				plugins: { "my-plugin": plugin },
				extends: [
					"my-plugin/recommended",
					{ rules: { "inline-rule": "warn" } },
				],
				rules: { "my-rule": "off" },
			})
			expect(result).toHaveLength(3)
			expect(result[0]).toEqual({ rules: { "plugin-rule": "error" } })
			expect(result[1]).toEqual({ rules: { "inline-rule": "warn" } })
			expect(result[2]).toEqual({
				plugins: { "my-plugin": plugin },
				rules: { "my-rule": "off" },
			})
		})

		it("empty inline extends are filtered", () => {
			const result = defineConfig({
				extends: [{}, { rules: { rule: "error" } }, {}],
				rules: { "my-rule": "warn" },
			})
			expect(result).toHaveLength(2)
			expect(result[0]).toEqual({ rules: { rule: "error" } })
			expect(result[1]).toEqual({ rules: { "my-rule": "warn" } })
		})
	})

	describe("Edge Cases", () => {
		it("handles plugin config that adds more plugins", () => {
			const nestedPlugin = createPlugin({
				configs: { nested: { rules: { "nested-rule": "error" } } },
			})
			const mainPlugin = createPlugin({
				configs: {
					recommended: {
						plugins: { "nested-plugin": nestedPlugin },
						rules: { "main-rule": "warn" },
					},
				},
			})
			const result = defineConfig(
				{ plugins: { "main-plugin": mainPlugin } },
				{ extends: ["main-plugin/recommended"] },
				{ extends: ["nested-plugin/nested"] },
			)
			expect(result).toHaveLength(3)
			expect(result[1]).toEqual({
				plugins: { "nested-plugin": nestedPlugin },
				rules: { "main-rule": "warn" },
			})
			expect(result[2]).toEqual({ rules: { "nested-rule": "error" } })
		})

		it("handles multiple levels of extends", () => {
			const midConfig: ConfigWithExtends = {
				extends: ["base/base"],
				rules: { "mid-rule": "warn" },
			}
			const topConfig: ConfigWithExtends = {
				extends: ["mid/mid"],
				rules: { "top-rule": "off" },
			}
			const basePlugin = createPlugin({
				configs: { base: { rules: { "base-rule": "error" } } },
			})
			const midPlugin = createPlugin({
				configs: {
					mid: midConfig,
				},
			})
			const topPlugin = createPlugin({
				configs: {
					top: topConfig,
				},
			})

			const result = defineConfig(
				{ plugins: { base: basePlugin, mid: midPlugin, top: topPlugin } },
				{ extends: ["top/top"] },
			)

			expect(result.length).toBeGreaterThanOrEqual(3)
			// Should have base, mid, top rules in order
			const allRules = result.flatMap((c) => Object.keys(c.rules || {}))
			expect(allRules).toContain("base-rule")
			expect(allRules).toContain("mid-rule")
			expect(allRules).toContain("top-rule")
		})

		it("preserves all config fields in output", () => {
			const plugin = createPlugin()
			const view = createView()
			const scope = createScope()
			const opts = createSetupOpts()

			const result = defineConfig({
				plugins: { "my-plugin": plugin },
				rules: { rule: "error" },
				options: { option: opts },
				views: { myView: view },
				scopes: { myScope: scope },
			})

			expect(result).toHaveLength(1)
			expect(result[0]).toEqual({
				plugins: { "my-plugin": plugin },
				rules: { rule: "error" },
				options: { option: opts },
				views: { myView: view },
				scopes: { myScope: scope },
			})
		})

		it("handles config with all empty fields except one", () => {
			// Note: Empty objects are preserved in output if any non-empty field exists
			// The filtering only determines whether to ADD to output, not whether to strip empty fields
			const opts = createSetupOpts()
			const result = defineConfig({
				plugins: {},
				rules: {},
				options: { onlyThis: opts },
				views: {},
				scopes: {},
			})
			// The config is added because options has content, but empty objects are preserved
			expect(result).toHaveLength(1)
			expect(result[0]?.options).toEqual({ onlyThis: opts })
		})
	})
})
