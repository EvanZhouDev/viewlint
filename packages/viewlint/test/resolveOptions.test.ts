import { describe, expect, it } from "vitest"
import { z } from "zod"
import { resolveOptions } from "../src/resolveOptions.js"
import type {
	Options,
	Plugin,
	RuleDefinition,
	RuleSchema,
	Scope,
	SetupOpts,
	View,
} from "../src/types.js"

function createRule(overrides?: {
	schema?: z.ZodTypeAny | ReadonlyArray<z.ZodTypeAny>
	defaultOptions?: unknown[]
	severity?: "warn" | "error" | "info"
}): RuleDefinition<RuleSchema | undefined> {
	return {
		meta: overrides ? { ...overrides } : undefined,
		run: async () => {},
	}
}

// Helper to create a plugin with rules
function createPlugin(
	rules: Record<string, RuleDefinition<RuleSchema | undefined>>,
): Plugin {
	return { rules }
}

function createSetupOpts(name: string): SetupOpts {
	return {
		meta: {
			name,
		},
	}
}

function createView(name: string): View {
	const setup: View["setup"] = async () => {
		throw new Error(`View '${name}' setup should not run in resolveOptions tests`)
	}

	return {
		meta: { name },
		setup,
	}
}

function createScope(name: string): Scope {
	const getLocator: Scope["getLocator"] = async () => {
		throw new Error(
			`Scope '${name}' getLocator should not run in resolveOptions tests`,
		)
	}

	return {
		meta: { name },
		getLocator,
	}
}

function testResolve(options: Options) {
	return resolveOptions(options)
}

describe("resolveOptions", () => {
	describe("Plugin Collection", () => {
		it("collects plugins from options.plugins", () => {
			const plugin = createPlugin({ "my-rule": createRule() })
			const result = testResolve({
				plugins: { "my-plugin": plugin },
			})

			expect(result.plugins.get("my-plugin")).toBe(plugin)
		})

		it("collects plugins from baseConfig", () => {
			const plugin = createPlugin({ "my-rule": createRule() })
			const result = testResolve({
				baseConfig: {
					plugins: { "base-plugin": plugin },
				},
			})

			expect(result.plugins.get("base-plugin")).toBe(plugin)
		})

		it("collects plugins from overrideConfig", () => {
			const plugin = createPlugin({ "my-rule": createRule() })
			const result = testResolve({
				overrideConfig: {
					plugins: { "override-plugin": plugin },
				},
			})

			expect(result.plugins.get("override-plugin")).toBe(plugin)
		})

		it("later plugins override earlier with same namespace", () => {
			const plugin1 = createPlugin({ "rule-a": createRule() })
			const plugin2 = createPlugin({ "rule-b": createRule() })
			const plugin3 = createPlugin({ "rule-c": createRule() })

			const result = testResolve({
				plugins: { "my-plugin": plugin1 },
				baseConfig: {
					plugins: { "my-plugin": plugin2 },
				},
				overrideConfig: {
					plugins: { "my-plugin": plugin3 },
				},
			})

			expect(result.plugins.get("my-plugin")).toBe(plugin3)
		})

		it("collects plugins from multiple config objects in order", () => {
			const plugin1 = createPlugin({ "rule-a": createRule() })
			const plugin2 = createPlugin({ "rule-b": createRule() })

			const result = testResolve({
				baseConfig: [
					{ plugins: { "plugin-1": plugin1 } },
					{ plugins: { "plugin-2": plugin2 } },
				],
			})

			expect(result.plugins.get("plugin-1")).toBe(plugin1)
			expect(result.plugins.get("plugin-2")).toBe(plugin2)
		})
	})

	describe("Rule Registry", () => {
		it("builds registry with correct namespaced IDs", () => {
			const rule = createRule()
			const plugin = createPlugin({ "my-rule": rule })

			const result = testResolve({
				plugins: { "my-plugin": plugin },
			})

			expect(result.ruleRegistry.get("my-plugin/my-rule")).toBe(rule)
		})

		it("throws on rule name containing /", () => {
			const rule = createRule()
			const plugin = createPlugin({ "invalid/rule": rule })

			expect(() =>
				testResolve({
					plugins: { "my-plugin": plugin },
				}),
			).toThrow(
				"Invalid rule name 'invalid/rule' in plugin 'my-plugin'. Rule names must not include '/'.",
			)
		})

		it("handles multiple plugins with different namespaces", () => {
			const rule1 = createRule()
			const rule2 = createRule()
			const plugin1 = createPlugin({ "rule-a": rule1 })
			const plugin2 = createPlugin({ "rule-b": rule2 })

			const result = testResolve({
				plugins: {
					"plugin-1": plugin1,
					"plugin-2": plugin2,
				},
			})

			expect(result.ruleRegistry.get("plugin-1/rule-a")).toBe(rule1)
			expect(result.ruleRegistry.get("plugin-2/rule-b")).toBe(rule2)
		})

		it("handles plugins with multiple rules", () => {
			const rule1 = createRule()
			const rule2 = createRule()
			const plugin = createPlugin({
				"rule-a": rule1,
				"rule-b": rule2,
			})

			const result = testResolve({
				plugins: { "my-plugin": plugin },
			})

			expect(result.ruleRegistry.get("my-plugin/rule-a")).toBe(rule1)
			expect(result.ruleRegistry.get("my-plugin/rule-b")).toBe(rule2)
		})
	})

	describe("Rule Config Processing", () => {
		it("throws when rule setting is undefined", () => {
			const plugin = createPlugin({ "my-rule": createRule() })

			expect(() =>
				testResolve({
					plugins: { "my-plugin": plugin },
					baseConfig: {
						rules: {
							// @ts-expect-error runtime validation should reject undefined rule settings
							"my-plugin/my-rule": undefined,
						},
					},
				}),
			).toThrow(
				"Rule 'my-plugin/my-rule' is configured with undefined. Use 'off' to disable a rule.",
			)
		})

		it("throws when rule not found in registry", () => {
			expect(() =>
				testResolve({
					baseConfig: {
						rules: { "unknown-plugin/unknown-rule": "error" },
					},
				}),
			).toThrow(/Unknown rule 'unknown-plugin\/unknown-rule'/)
		})

		it("resolves simple severity string", () => {
			const plugin = createPlugin({ "my-rule": createRule() })

			const result = testResolve({
				plugins: { "my-plugin": plugin },
				baseConfig: {
					rules: { "my-plugin/my-rule": "warn" },
				},
			})

			const ruleConfig = result.rules.get("my-plugin/my-rule")
			expect(ruleConfig).toEqual({
				severity: "warn",
				options: [],
			})
		})

		it("resolves severity with options array", () => {
			const schema = z.object({ foo: z.string() })
			const plugin = createPlugin({
				"my-rule": createRule({ schema }),
			})

			const result = testResolve({
				plugins: { "my-plugin": plugin },
				baseConfig: {
					rules: { "my-plugin/my-rule": ["error", { foo: "bar" }] },
				},
			})

			const ruleConfig = result.rules.get("my-plugin/my-rule")
			expect(ruleConfig).toEqual({
				severity: "error",
				options: [{ foo: "bar" }],
			})
		})

		it("handles all severity levels", () => {
			const plugin = createPlugin({
				"rule-off": createRule(),
				"rule-warn": createRule(),
				"rule-error": createRule(),
				"rule-info": createRule(),
			})

			const result = testResolve({
				plugins: { p: plugin },
				baseConfig: {
					rules: {
						"p/rule-off": "off",
						"p/rule-warn": "warn",
						"p/rule-error": "error",
						"p/rule-info": "info",
					},
				},
			})

			expect(result.rules.get("p/rule-off")?.severity).toBe("off")
			expect(result.rules.get("p/rule-warn")?.severity).toBe("warn")
			expect(result.rules.get("p/rule-error")?.severity).toBe("error")
			expect(result.rules.get("p/rule-info")?.severity).toBe("info")
		})
	})

	describe("Option Validation", () => {
		it("throws when options provided but no schema", () => {
			const plugin = createPlugin({ "my-rule": createRule() })

			expect(() =>
				testResolve({
					plugins: { "my-plugin": plugin },
					baseConfig: {
						rules: { "my-plugin/my-rule": ["error", { some: "option" }] },
					},
				}),
			).toThrow(
				"Rule 'my-plugin/my-rule' does not accept options, but options were provided.",
			)
		})

		it("returns empty options when no schema and no options provided", () => {
			const plugin = createPlugin({ "my-rule": createRule() })

			const result = testResolve({
				plugins: { "my-plugin": plugin },
				baseConfig: {
					rules: { "my-plugin/my-rule": "error" },
				},
			})

			expect(result.rules.get("my-plugin/my-rule")?.options).toEqual([])
		})

		it("throws when too many options for array schema", () => {
			const plugin = createPlugin({
				"my-rule": createRule({
					schema: [z.string(), z.number()],
				}),
			})

			expect(() =>
				testResolve({
					plugins: { "my-plugin": plugin },
					baseConfig: {
						rules: { "my-plugin/my-rule": ["error", "a", 1, "extra"] },
					},
				}),
			).toThrow(
				"Too many options for rule 'my-plugin/my-rule'. Expected at most 2 but got 3.",
			)
		})

		it("throws when too many options for single schema", () => {
			const plugin = createPlugin({
				"my-rule": createRule({
					schema: z.string(),
				}),
			})

			expect(() =>
				testResolve({
					plugins: { "my-plugin": plugin },
					baseConfig: {
						rules: { "my-plugin/my-rule": ["error", "valid", "extra"] },
					},
				}),
			).toThrow(
				"Too many options for rule 'my-plugin/my-rule'. Expected at most 1 but got 2.",
			)
		})

		it("throws on invalid option values for single schema", () => {
			const plugin = createPlugin({
				"my-rule": createRule({
					schema: z.string(),
				}),
			})

			expect(() =>
				testResolve({
					plugins: { "my-plugin": plugin },
					baseConfig: {
						rules: { "my-plugin/my-rule": ["error", 123] },
					},
				}),
			).toThrow(/Invalid options for rule 'my-plugin\/my-rule'\./)
		})

		it("throws on invalid option values for array schema with index", () => {
			const plugin = createPlugin({
				"my-rule": createRule({
					schema: [z.string(), z.number()],
				}),
			})

			expect(() =>
				testResolve({
					plugins: { "my-plugin": plugin },
					baseConfig: {
						rules: { "my-plugin/my-rule": ["error", "valid", "not-a-number"] },
					},
				}),
			).toThrow(/Invalid options for rule 'my-plugin\/my-rule' at index 1\./)
		})

		it("parses valid options correctly with single schema", () => {
			const plugin = createPlugin({
				"my-rule": createRule({
					schema: z.object({ enabled: z.boolean() }),
				}),
			})

			const result = testResolve({
				plugins: { "my-plugin": plugin },
				baseConfig: {
					rules: { "my-plugin/my-rule": ["error", { enabled: true }] },
				},
			})

			expect(result.rules.get("my-plugin/my-rule")?.options).toEqual([
				{ enabled: true },
			])
		})

		it("parses valid options correctly with array schema", () => {
			const plugin = createPlugin({
				"my-rule": createRule({
					schema: [z.string(), z.number()],
				}),
			})

			const result = testResolve({
				plugins: { "my-plugin": plugin },
				baseConfig: {
					rules: { "my-plugin/my-rule": ["error", "hello", 42] },
				},
			})

			expect(result.rules.get("my-plugin/my-rule")?.options).toEqual([
				"hello",
				42,
			])
		})

		it("uses defaultOptions when not provided with single schema", () => {
			const plugin = createPlugin({
				"my-rule": createRule({
					schema: z.object({ threshold: z.number() }),
					defaultOptions: [{ threshold: 10 }],
				}),
			})

			const result = testResolve({
				plugins: { "my-plugin": plugin },
				baseConfig: {
					rules: { "my-plugin/my-rule": "error" },
				},
			})

			expect(result.rules.get("my-plugin/my-rule")?.options).toEqual([
				{ threshold: 10 },
			])
		})

		it("uses defaultOptions when not provided with array schema", () => {
			const plugin = createPlugin({
				"my-rule": createRule({
					schema: [z.string(), z.number()],
					defaultOptions: ["default", 5],
				}),
			})

			const result = testResolve({
				plugins: { "my-plugin": plugin },
				baseConfig: {
					rules: { "my-plugin/my-rule": "error" },
				},
			})

			expect(result.rules.get("my-plugin/my-rule")?.options).toEqual([
				"default",
				5,
			])
		})

		it("deep merges provided options with defaultOptions for single schema", () => {
			const plugin = createPlugin({
				"my-rule": createRule({
					schema: z.object({
						a: z.number(),
						b: z.number(),
					}),
					defaultOptions: [{ a: 1, b: 2 }],
				}),
			})

			const result = testResolve({
				plugins: { "my-plugin": plugin },
				baseConfig: {
					rules: { "my-plugin/my-rule": ["error", { a: 10 }] },
				},
			})

			expect(result.rules.get("my-plugin/my-rule")?.options).toEqual([
				{ a: 10, b: 2 },
			])
		})

		it("deep merges provided options with defaultOptions for array schema", () => {
			const plugin = createPlugin({
				"my-rule": createRule({
					schema: [
						z.object({ x: z.number(), y: z.number() }),
						z.object({ enabled: z.boolean() }),
					],
					defaultOptions: [{ x: 0, y: 0 }, { enabled: false }],
				}),
			})

			const result = testResolve({
				plugins: { "my-plugin": plugin },
				baseConfig: {
					rules: { "my-plugin/my-rule": ["error", { x: 5 }] },
				},
			})

			expect(result.rules.get("my-plugin/my-rule")?.options).toEqual([
				{ x: 5, y: 0 },
				{ enabled: false },
			])
		})

		it("allows partial options with array schema", () => {
			const plugin = createPlugin({
				"my-rule": createRule({
					schema: [z.string(), z.number(), z.boolean()],
					defaultOptions: ["default", 0, false],
				}),
			})

			const result = testResolve({
				plugins: { "my-plugin": plugin },
				baseConfig: {
					rules: { "my-plugin/my-rule": ["error", "custom"] },
				},
			})

			expect(result.rules.get("my-plugin/my-rule")?.options).toEqual([
				"custom",
				0,
				false,
			])
		})
	})

	describe("Severity Inheritance", () => {
		it("uses rule's meta.severity when inherit", () => {
			const plugin = createPlugin({
				"my-rule": createRule({ severity: "warn" }),
			})

			const result = testResolve({
				plugins: { "my-plugin": plugin },
				baseConfig: {
					rules: { "my-plugin/my-rule": "inherit" },
				},
			})

			expect(result.rules.get("my-plugin/my-rule")?.severity).toBe("warn")
		})

		it("defaults to 'error' when no meta.severity", () => {
			const plugin = createPlugin({ "my-rule": createRule() })

			const result = testResolve({
				plugins: { "my-plugin": plugin },
				baseConfig: {
					rules: { "my-plugin/my-rule": "inherit" },
				},
			})

			expect(result.rules.get("my-plugin/my-rule")?.severity).toBe("error")
		})

		it("uses previous options when inherit with no new options", () => {
			const schema = z.object({ value: z.number() })
			const plugin = createPlugin({
				"my-rule": createRule({ schema }),
			})

			const result = testResolve({
				plugins: { "my-plugin": plugin },
				baseConfig: [
					{ rules: { "my-plugin/my-rule": ["warn", { value: 42 }] } },
					{ rules: { "my-plugin/my-rule": "inherit" } },
				],
			})

			const ruleConfig = result.rules.get("my-plugin/my-rule")
			expect(ruleConfig?.severity).toBe("error") // defaults to error
			expect(ruleConfig?.options).toEqual([{ value: 42 }])
		})

		it("uses parsed defaults when no previous config", () => {
			const plugin = createPlugin({
				"my-rule": createRule({
					schema: z.object({ threshold: z.number() }),
					defaultOptions: [{ threshold: 100 }],
				}),
			})

			const result = testResolve({
				plugins: { "my-plugin": plugin },
				baseConfig: {
					rules: { "my-plugin/my-rule": "inherit" },
				},
			})

			expect(result.rules.get("my-plugin/my-rule")?.options).toEqual([
				{ threshold: 100 },
			])
		})

		it("parses new options when inherit with options provided", () => {
			const schema = z.object({ value: z.number() })
			const plugin = createPlugin({
				"my-rule": createRule({ schema, severity: "info" }),
			})

			const result = testResolve({
				plugins: { "my-plugin": plugin },
				baseConfig: {
					rules: { "my-plugin/my-rule": ["inherit", { value: 99 }] },
				},
			})

			const ruleConfig = result.rules.get("my-plugin/my-rule")
			expect(ruleConfig?.severity).toBe("info")
			expect(ruleConfig?.options).toEqual([{ value: 99 }])
		})
	})

	describe("Options/Views/Scopes Registries", () => {
		it("collects options from config objects", () => {
			const setupA = createSetupOpts("setup-a")
			const result = testResolve({
				baseConfig: {
					options: {
						"setup-a": setupA,
					},
				},
			})

			expect(result.optionsRegistry.get("setup-a")).toEqual(setupA)
		})

		it("collects views from config objects", () => {
			const view = createView("view-a")
			const result = testResolve({
				baseConfig: {
					views: { "view-a": view },
				},
			})

			expect(result.viewRegistry.get("view-a")).toBe(view)
		})

		it("collects scopes from config objects", () => {
			const scope = createScope("scope-a")
			const result = testResolve({
				baseConfig: {
					scopes: { "scope-a": scope },
				},
			})

			expect(result.scopeRegistry.get("scope-a")).toBe(scope)
		})

		it("later options values override earlier ones", () => {
			const setupV1 = createSetupOpts("version-1")
			const setupV2 = createSetupOpts("version-2")
			const result = testResolve({
				baseConfig: [
					{ options: { "setup-a": setupV1 } },
					{ options: { "setup-a": setupV2 } },
				],
			})

			expect(result.optionsRegistry.get("setup-a")).toEqual(setupV2)
		})

		it("later views values override earlier ones", () => {
			const view1 = createView("view-v1")
			const view2 = createView("view-v2")
			const result = testResolve({
				baseConfig: [
					{ views: { "my-view": view1 } },
					{ views: { "my-view": view2 } },
				],
			})

			expect(result.viewRegistry.get("my-view")).toBe(view2)
		})

		it("later scopes values override earlier ones", () => {
			const scope1 = createScope("scope-ts")
			const scope2 = createScope("scope-tsx")
			const result = testResolve({
				baseConfig: [
					{ scopes: { "my-scope": scope1 } },
					{ scopes: { "my-scope": scope2 } },
				],
			})

			expect(result.scopeRegistry.get("my-scope")).toBe(scope2)
		})

		it("supports array values for options", () => {
			const opts: SetupOpts[] = [
				createSetupOpts("multi-setup-1"),
				createSetupOpts("multi-setup-2"),
			]
			const result = testResolve({
				baseConfig: {
					options: { "multi-setup": opts },
				},
			})

			expect(result.optionsRegistry.get("multi-setup")).toEqual(opts)
		})

		it("supports array values for scopes", () => {
			const scopes: Scope[] = [
				createScope("multi-scope-1"),
				createScope("multi-scope-2"),
			]
			const result = testResolve({
				baseConfig: {
					scopes: { "multi-scope": scopes },
				},
			})

			expect(result.scopeRegistry.get("multi-scope")).toEqual(scopes)
		})
	})

	describe("Config Merging", () => {
		it("baseConfig processed before overrideConfig", () => {
			const plugin = createPlugin({ "my-rule": createRule() })

			const result = testResolve({
				plugins: { "my-plugin": plugin },
				baseConfig: {
					rules: { "my-plugin/my-rule": "warn" },
				},
				overrideConfig: {
					rules: { "my-plugin/my-rule": "error" },
				},
			})

			expect(result.rules.get("my-plugin/my-rule")?.severity).toBe("error")
		})

		it("baseConfig can be an array", () => {
			const plugin = createPlugin({
				"rule-a": createRule(),
				"rule-b": createRule(),
			})

			const result = testResolve({
				plugins: { p: plugin },
				baseConfig: [
					{ rules: { "p/rule-a": "warn" } },
					{ rules: { "p/rule-b": "info" } },
				],
			})

			expect(result.rules.get("p/rule-a")?.severity).toBe("warn")
			expect(result.rules.get("p/rule-b")?.severity).toBe("info")
		})

		it("overrideConfig can be an array", () => {
			const plugin = createPlugin({
				"rule-a": createRule(),
				"rule-b": createRule(),
			})

			const result = testResolve({
				plugins: { p: plugin },
				overrideConfig: [
					{ rules: { "p/rule-a": "warn" } },
					{ rules: { "p/rule-b": "info" } },
				],
			})

			expect(result.rules.get("p/rule-a")?.severity).toBe("warn")
			expect(result.rules.get("p/rule-b")?.severity).toBe("info")
		})

		it("handles undefined baseConfig", () => {
			const plugin = createPlugin({ "my-rule": createRule() })

			const result = testResolve({
				plugins: { "my-plugin": plugin },
				overrideConfig: {
					rules: { "my-plugin/my-rule": "error" },
				},
			})

			expect(result.rules.get("my-plugin/my-rule")?.severity).toBe("error")
		})

		it("handles undefined overrideConfig", () => {
			const plugin = createPlugin({ "my-rule": createRule() })

			const result = testResolve({
				plugins: { "my-plugin": plugin },
				baseConfig: {
					rules: { "my-plugin/my-rule": "warn" },
				},
			})

			expect(result.rules.get("my-plugin/my-rule")?.severity).toBe("warn")
		})

		it("handles empty options object", () => {
			const result = testResolve({})

			expect(result.plugins.size).toBe(0)
			expect(result.ruleRegistry.size).toBe(0)
			expect(result.rules.size).toBe(0)
			expect(result.optionsRegistry.size).toBe(0)
			expect(result.viewRegistry.size).toBe(0)
			expect(result.scopeRegistry.size).toBe(0)
		})

		it("later array items override earlier for same rule", () => {
			const plugin = createPlugin({ "my-rule": createRule() })

			const result = testResolve({
				plugins: { "my-plugin": plugin },
				baseConfig: [
					{ rules: { "my-plugin/my-rule": "warn" } },
					{ rules: { "my-plugin/my-rule": "off" } },
					{ rules: { "my-plugin/my-rule": "info" } },
				],
			})

			expect(result.rules.get("my-plugin/my-rule")?.severity).toBe("info")
		})

		it("combines rules from multiple configs", () => {
			const plugin = createPlugin({
				"rule-a": createRule(),
				"rule-b": createRule(),
				"rule-c": createRule(),
			})

			const result = testResolve({
				plugins: { p: plugin },
				baseConfig: { rules: { "p/rule-a": "warn" } },
				overrideConfig: [
					{ rules: { "p/rule-b": "error" } },
					{ rules: { "p/rule-c": "info" } },
				],
			})

			expect(result.rules.get("p/rule-a")?.severity).toBe("warn")
			expect(result.rules.get("p/rule-b")?.severity).toBe("error")
			expect(result.rules.get("p/rule-c")?.severity).toBe("info")
		})
	})

	describe("Integration Scenarios", () => {
		it("handles complex config with all features", () => {
			const schemaA = z.object({ limit: z.number() })
			const schemaB = z.string()

			const plugin = createPlugin({
				"rule-a": createRule({
					schema: schemaA,
					defaultOptions: [{ limit: 10 }],
					severity: "warn",
				}),
				"rule-b": createRule({
					schema: schemaB,
				}),
			})

			const view = createView("view-1")
			const scope = createScope("scope-1")
			const setup = createSetupOpts("setup-1")

			const result = testResolve({
				plugins: { "my-plugin": plugin },
				baseConfig: [
					{
						rules: {
							"my-plugin/rule-a": "inherit",
							"my-plugin/rule-b": ["error", "hello"],
						},
						options: { "setup-1": setup },
						views: { "view-1": view },
						scopes: { "scope-1": scope },
					},
				],
				overrideConfig: {
					rules: {
						"my-plugin/rule-a": ["error", { limit: 20 }],
					},
				},
			})

			// Plugin collected
			expect(result.plugins.get("my-plugin")).toBe(plugin)

			// Rules registered
			expect(result.ruleRegistry.has("my-plugin/rule-a")).toBe(true)
			expect(result.ruleRegistry.has("my-plugin/rule-b")).toBe(true)

			// Rule configs resolved
			expect(result.rules.get("my-plugin/rule-a")).toEqual({
				severity: "error",
				options: [{ limit: 20 }],
			})
			expect(result.rules.get("my-plugin/rule-b")).toEqual({
				severity: "error",
				options: ["hello"],
			})

			// Options, views, scopes collected
			expect(result.optionsRegistry.get("setup-1")).toEqual(setup)
			expect(result.viewRegistry.get("view-1")).toBe(view)
			expect(result.scopeRegistry.get("scope-1")).toBe(scope)
		})

		it("handles plugins without rules field", () => {
			const emptyPlugin: Plugin = {}

			const result = testResolve({
				plugins: { "empty-plugin": emptyPlugin },
			})

			expect(result.plugins.get("empty-plugin")).toBe(emptyPlugin)
			expect(result.ruleRegistry.size).toBe(0)
		})

		it("handles rule with empty meta", () => {
			const rule = {
				meta: {},
				run: async () => {},
			}
			const plugin = createPlugin({ "my-rule": rule })

			const result = testResolve({
				plugins: { "my-plugin": plugin },
				baseConfig: {
					rules: { "my-plugin/my-rule": "warn" },
				},
			})

			expect(result.rules.get("my-plugin/my-rule")).toEqual({
				severity: "warn",
				options: [],
			})
		})

		it("handles inherit with meta.severity but no previous config and no default options", () => {
			const plugin = createPlugin({
				"my-rule": createRule({ severity: "info" }),
			})

			const result = testResolve({
				plugins: { "my-plugin": plugin },
				baseConfig: {
					rules: { "my-plugin/my-rule": "inherit" },
				},
			})

			expect(result.rules.get("my-plugin/my-rule")).toEqual({
				severity: "info",
				options: [],
			})
		})
	})
})
