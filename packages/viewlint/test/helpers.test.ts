import { describe, expect, it } from "vitest"
import { deepMerge, isRecord, resolveRuleId, toArray } from "../src/helpers.js"
import type { RuleDefinition } from "../src/types.js"

describe("isRecord", () => {
	describe("returns true for objects", () => {
		it("returns true for empty plain object", () => {
			expect(isRecord({})).toBe(true)
		})

		it("returns true for object with properties", () => {
			expect(isRecord({ a: 1, b: "hello" })).toBe(true)
		})

		it("returns true for arrays (typeof [] === 'object')", () => {
			expect(isRecord([])).toBe(true)
			expect(isRecord([1, 2, 3])).toBe(true)
		})

		it("returns true for Date instances", () => {
			expect(isRecord(new Date())).toBe(true)
		})

		it("returns true for Object.create(null)", () => {
			expect(isRecord(Object.create(null))).toBe(true)
		})

		it("returns true for class instances", () => {
			class MyClass {
				value = 42
			}
			expect(isRecord(new MyClass())).toBe(true)
		})

		it("returns true for nested objects", () => {
			expect(isRecord({ nested: { deep: { value: 1 } } })).toBe(true)
		})

		it("returns true for Map and Set instances", () => {
			expect(isRecord(new Map())).toBe(true)
			expect(isRecord(new Set())).toBe(true)
		})

		it("returns true for RegExp instances", () => {
			expect(isRecord(/test/)).toBe(true)
		})
	})

	describe("returns false for non-objects", () => {
		it("returns false for null", () => {
			expect(isRecord(null)).toBe(false)
		})

		it("returns false for undefined", () => {
			expect(isRecord(undefined)).toBe(false)
		})

		it("returns false for numbers", () => {
			expect(isRecord(0)).toBe(false)
			expect(isRecord(42)).toBe(false)
			expect(isRecord(-1)).toBe(false)
			expect(isRecord(3.14)).toBe(false)
			expect(isRecord(NaN)).toBe(false)
			expect(isRecord(Infinity)).toBe(false)
		})

		it("returns false for strings", () => {
			expect(isRecord("")).toBe(false)
			expect(isRecord("hello")).toBe(false)
		})

		it("returns false for booleans", () => {
			expect(isRecord(true)).toBe(false)
			expect(isRecord(false)).toBe(false)
		})

		it("returns false for symbols", () => {
			expect(isRecord(Symbol("test"))).toBe(false)
			expect(isRecord(Symbol.for("test"))).toBe(false)
		})

		it("returns false for functions", () => {
			expect(isRecord(() => {})).toBe(false)
			expect(isRecord(function named() {})).toBe(false)
			expect(isRecord(async () => {})).toBe(false)
			expect(isRecord(function* generator() {})).toBe(false)
		})

		it("returns false for bigint", () => {
			expect(isRecord(BigInt(42))).toBe(false)
		})
	})
})

describe("toArray", () => {
	describe("handles undefined", () => {
		it("returns empty array for undefined", () => {
			expect(toArray(undefined)).toEqual([])
		})
	})

	describe("handles arrays", () => {
		it("returns same reference for empty array", () => {
			const arr: number[] = []
			const result = toArray(arr)
			expect(result).toBe(arr)
			expect(result).toEqual([])
		})

		it("returns same reference for non-empty array", () => {
			const arr = [1, 2, 3]
			const result = toArray(arr)
			expect(result).toBe(arr)
			expect(result).toEqual([1, 2, 3])
		})

		it("returns same reference for array of objects", () => {
			const arr = [{ a: 1 }, { b: 2 }]
			const result = toArray(arr)
			expect(result).toBe(arr)
		})
	})

	describe("wraps non-array values", () => {
		it("wraps string in array", () => {
			expect(toArray("hello")).toEqual(["hello"])
		})

		it("wraps empty string in array", () => {
			expect(toArray("")).toEqual([""])
		})

		it("wraps number in array", () => {
			expect(toArray(42)).toEqual([42])
		})

		it("wraps zero in array", () => {
			expect(toArray(0)).toEqual([0])
		})

		it("wraps object in array", () => {
			const obj = { a: 1 }
			const result = toArray(obj)
			expect(result).toEqual([{ a: 1 }])
			expect(result[0]).toBe(obj)
		})

		it("wraps null in array (null is not undefined)", () => {
			expect(toArray(null)).toEqual([null])
		})

		it("wraps boolean in array", () => {
			expect(toArray(true)).toEqual([true])
			expect(toArray(false)).toEqual([false])
		})

		it("wraps function in array", () => {
			const fn = () => {}
			const result = toArray(fn)
			expect(result).toEqual([fn])
			expect(result[0]).toBe(fn)
		})
	})
})

describe("deepMerge", () => {
	describe("handles falsy values", () => {
		it("returns base when override is undefined", () => {
			expect(deepMerge({ a: 1 }, undefined)).toEqual({ a: 1 })
		})

		it("returns base when override is null", () => {
			expect(deepMerge({ a: 1 }, null)).toEqual({ a: 1 })
		})

		it("returns base when override is 0", () => {
			expect(deepMerge({ a: 1 }, 0 as unknown as object)).toEqual({ a: 1 })
		})

		it("returns base when override is empty string", () => {
			expect(deepMerge({ a: 1 }, "" as unknown as object)).toEqual({ a: 1 })
		})

		it("returns base when override is false", () => {
			expect(deepMerge({ a: 1 }, false as unknown as object)).toEqual({ a: 1 })
		})

		it("returns override when base is undefined", () => {
			expect(deepMerge(undefined, { a: 1 })).toEqual({ a: 1 })
		})

		it("returns override when base is null", () => {
			expect(deepMerge(null, { a: 1 })).toEqual({ a: 1 })
		})

		it("returns override when base is 0", () => {
			expect(deepMerge(0 as unknown as object, { a: 1 })).toEqual({ a: 1 })
		})

		it("returns override when base is empty string", () => {
			expect(deepMerge("" as unknown as object, { a: 1 })).toEqual({ a: 1 })
		})

		it("returns override when base is false", () => {
			expect(deepMerge(false as unknown as object, { a: 1 })).toEqual({ a: 1 })
		})
	})

	describe("merges plain objects", () => {
		it("merges disjoint properties", () => {
			expect(deepMerge({ a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2 })
		})

		it("override wins for same property", () => {
			expect(deepMerge({ a: 1 }, { a: 2 })).toEqual({ a: 2 })
		})

		it("merges multiple properties", () => {
			expect(deepMerge({ a: 1, b: 2 }, { b: 3, c: 4 })).toEqual({
				a: 1,
				b: 3,
				c: 4,
			})
		})

		it("handles empty objects", () => {
			expect(deepMerge({}, { a: 1 })).toEqual({ a: 1 })
			expect(deepMerge({ a: 1 }, {})).toEqual({ a: 1 })
			expect(deepMerge({}, {})).toEqual({})
		})
	})

	describe("recursively merges nested objects", () => {
		it("merges nested disjoint properties", () => {
			expect(deepMerge({ a: { x: 1 } }, { a: { y: 2 } })).toEqual({
				a: { x: 1, y: 2 },
			})
		})

		it("override wins for nested same property", () => {
			expect(deepMerge({ a: { x: 1 } }, { a: { x: 2 } })).toEqual({
				a: { x: 2 },
			})
		})

		it("deeply merges multiple levels", () => {
			expect(
				deepMerge({ a: { b: { c: 1, d: 2 } } }, { a: { b: { d: 3, e: 4 } } }),
			).toEqual({ a: { b: { c: 1, d: 3, e: 4 } } })
		})

		it("preserves nested objects in base when not in override", () => {
			expect(deepMerge({ a: { x: 1 }, b: { y: 2 } }, { a: { z: 3 } })).toEqual({
				a: { x: 1, z: 3 },
				b: { y: 2 },
			})
		})

		it("handles undefined values in nested objects", () => {
			expect(deepMerge({ a: undefined }, { a: 1 })).toEqual({ a: 1 })
		})
	})

	describe("replaces arrays entirely", () => {
		it("replaces array in nested object", () => {
			expect(deepMerge({ arr: [1, 2] }, { arr: [3, 4] })).toEqual({
				arr: [3, 4],
			})
		})

		it("replaces array at top level", () => {
			expect(deepMerge([1, 2], [3, 4])).toEqual([3, 4])
		})

		it("replaces with empty array", () => {
			expect(deepMerge({ arr: [1, 2, 3] }, { arr: [] })).toEqual({ arr: [] })
		})

		it("replaces empty array with non-empty", () => {
			expect(deepMerge({ arr: [] }, { arr: [1, 2] })).toEqual({ arr: [1, 2] })
		})

		it("replaces array of objects", () => {
			expect(
				deepMerge({ items: [{ a: 1 }] }, { items: [{ b: 2 }, { c: 3 }] }),
			).toEqual({ items: [{ b: 2 }, { c: 3 }] })
		})
	})

	describe("replaces non-plain objects entirely", () => {
		it("replaces Date instances", () => {
			const date1 = new Date("2020-01-01")
			const date2 = new Date("2025-01-01")
			const result = deepMerge({ date: date1 }, { date: date2 })
			expect(result.date).toBe(date2)
		})

		it("replaces class instances", () => {
			class MyClass {
				constructor(public value: number) {}
			}
			const instance1 = new MyClass(1)
			const instance2 = new MyClass(2)
			const result = deepMerge({ obj: instance1 }, { obj: instance2 })
			expect(result.obj).toBe(instance2)
		})
	})

	describe("handles Object.create(null)", () => {
		it("merges Object.create(null) as plain object", () => {
			const nullProto = Object.create(null) as Record<string, unknown>
			nullProto.x = 1
			const result = deepMerge(nullProto, { a: 1 })
			expect(result).toEqual({ x: 1, a: 1 })
		})

		it("merges into Object.create(null)", () => {
			const nullProto = Object.create(null) as Record<string, unknown>
			nullProto.a = 1
			const result = deepMerge({ x: 1 }, nullProto)
			expect(result).toEqual({ x: 1, a: 1 })
		})
	})

	describe("edge cases", () => {
		it("handles deeply nested mixed structures", () => {
			const base = {
				level1: {
					level2: {
						arr: [1, 2],
						obj: { a: 1 },
						value: "base",
					},
				},
			}
			const override = {
				level1: {
					level2: {
						arr: [3],
						obj: { b: 2 },
						newProp: true,
					},
				},
			}
			expect(
				deepMerge(
					base as Record<string, unknown>,
					override as Record<string, unknown>,
				),
			).toEqual({
				level1: {
					level2: {
						arr: [3],
						obj: { a: 1, b: 2 },
						value: "base",
						newProp: true,
					},
				},
			})
		})
	})
})

describe("resolveRuleId", () => {
	// Mock RuleDefinition - we use type assertion since we only need the map keys
	const createRegistry = (
		rules: Record<string, object>,
	): Map<string, RuleDefinition> => {
		return new Map(Object.entries(rules)) as Map<string, RuleDefinition>
	}

	describe("exact matches", () => {
		it("returns exact match unchanged", () => {
			const registry = createRegistry({
				"plugin/rule1": {},
				"other/rule1": {},
				"plugin/unique": {},
			})
			expect(resolveRuleId("plugin/rule1", registry)).toBe("plugin/rule1")
		})

		it("returns exact match for unique rule", () => {
			const registry = createRegistry({
				"plugin/unique": {},
			})
			expect(resolveRuleId("plugin/unique", registry)).toBe("plugin/unique")
		})
	})

	describe("short form resolution", () => {
		it("resolves unambiguous short form", () => {
			const registry = createRegistry({
				"plugin/rule1": {},
				"other/rule1": {},
				"plugin/unique": {},
			})
			expect(resolveRuleId("unique", registry)).toBe("plugin/unique")
		})

		it("resolves short form with single matching rule", () => {
			const registry = createRegistry({
				"my-plugin/some-rule": {},
				"another/different-rule": {},
			})
			expect(resolveRuleId("some-rule", registry)).toBe("my-plugin/some-rule")
			expect(resolveRuleId("different-rule", registry)).toBe(
				"another/different-rule",
			)
		})
	})

	describe("ambiguous short form", () => {
		it("throws for ambiguous short form", () => {
			const registry = createRegistry({
				"plugin/rule1": {},
				"other/rule1": {},
				"plugin/unique": {},
			})
			expect(() => resolveRuleId("rule1", registry)).toThrow(
				/Ambiguous rule 'rule1'/,
			)
		})

		it("includes matches in error message", () => {
			const registry = createRegistry({
				"plugin/rule1": {},
				"other/rule1": {},
			})
			expect(() => resolveRuleId("rule1", registry)).toThrow(/Matches:/)
		})

		it("suggests using fully-qualified rule ID", () => {
			const registry = createRegistry({
				"plugin/rule1": {},
				"other/rule1": {},
			})
			expect(() => resolveRuleId("rule1", registry)).toThrow(
				/Use a fully-qualified rule ID/,
			)
		})
	})

	describe("unknown rules", () => {
		it("throws for unknown short form rule", () => {
			const registry = createRegistry({
				"plugin/rule1": {},
				"other/rule1": {},
				"plugin/unique": {},
			})
			expect(() => resolveRuleId("nonexistent", registry)).toThrow(
				/Unknown rule 'nonexistent'/,
			)
		})

		it("throws for unknown fully-qualified rule", () => {
			const registry = createRegistry({
				"plugin/rule1": {},
				"other/rule1": {},
				"plugin/unique": {},
			})
			expect(() => resolveRuleId("plugin/nonexistent", registry)).toThrow(
				/Unknown rule 'plugin\/nonexistent'/,
			)
		})

		it("lists available rules in error message", () => {
			const registry = createRegistry({
				"plugin/rule1": {},
				"other/rule2": {},
			})
			try {
				resolveRuleId("nonexistent", registry)
				expect.fail("Should have thrown")
			} catch (e) {
				const message = (e as Error).message
				expect(message).toMatch(/Available rules:/)
			}
		})
	})

	describe("empty registry", () => {
		it("throws for any rule with empty registry", () => {
			const registry = createRegistry({})
			expect(() => resolveRuleId("anything", registry)).toThrow(/Unknown rule/)
		})

		it("includes helpful message about no registered rules", () => {
			const registry = createRegistry({})
			expect(() => resolveRuleId("anything", registry)).toThrow(
				/No rules are registered; did you forget to configure a plugin\?/,
			)
		})

		it("throws for fully-qualified rule with empty registry", () => {
			const registry = createRegistry({})
			expect(() => resolveRuleId("plugin/rule", registry)).toThrow(
				/No rules are registered/,
			)
		})
	})

	describe("edge cases", () => {
		it("handles rules with multiple slashes", () => {
			const registry = createRegistry({
				"@scope/plugin/rule": {},
			})
			expect(resolveRuleId("@scope/plugin/rule", registry)).toBe(
				"@scope/plugin/rule",
			)
		})

		it("handles hyphenated rule names", () => {
			const registry = createRegistry({
				"my-plugin/my-rule-name": {},
			})
			expect(resolveRuleId("my-rule-name", registry)).toBe(
				"my-plugin/my-rule-name",
			)
		})

		it("is case-sensitive", () => {
			const registry = createRegistry({
				"plugin/MyRule": {},
			})
			expect(() => resolveRuleId("myrule", registry)).toThrow(/Unknown rule/)
			expect(resolveRuleId("MyRule", registry)).toBe("plugin/MyRule")
		})

		it("handles single rule in registry", () => {
			const registry = createRegistry({
				"only/rule": {},
			})
			expect(resolveRuleId("rule", registry)).toBe("only/rule")
			expect(resolveRuleId("only/rule", registry)).toBe("only/rule")
		})
	})
})
