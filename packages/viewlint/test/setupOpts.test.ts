import { describe, expect, it } from "vitest"
import {
	concatSetupOptsLayers,
	mergeSetupOpts,
	mergeSetupOptsLayers,
	toSetupOptsLayers,
} from "../src/setupOpts.js"

describe("toSetupOptsLayers", () => {
	it("returns empty array for undefined", () => {
		expect(toSetupOptsLayers(undefined)).toEqual([])
	})

	it("returns empty array for null", () => {
		// @ts-expect-error - testing runtime behavior with null
		expect(toSetupOptsLayers(null)).toEqual([])
	})

	it("returns same reference for empty array input", () => {
		const input: [] = []
		const result = toSetupOptsLayers(input)
		expect(result).toBe(input)
		expect(result).toEqual([])
	})

	it("returns same reference for array input", () => {
		const input = [{ context: { baseURL: "http://example.com" } }]
		const result = toSetupOptsLayers(input)
		expect(result).toBe(input)
	})

	it("wraps single object in array", () => {
		const input = { context: { baseURL: "http://example.com" } }
		const result = toSetupOptsLayers(input)
		expect(result).toEqual([{ context: { baseURL: "http://example.com" } }])
		expect(result[0]).toBe(input)
	})

	it("wraps empty object in array", () => {
		const input = {}
		const result = toSetupOptsLayers(input)
		expect(result).toEqual([{}])
		expect(result[0]).toBe(input)
	})

	it("wraps object with meta in array", () => {
		const input = { meta: { name: "test" } }
		const result = toSetupOptsLayers(input)
		expect(result).toEqual([{ meta: { name: "test" } }])
	})

	it("wraps object with args in array", () => {
		const input = { args: { foo: "bar", count: 42 } }
		const result = toSetupOptsLayers(input)
		expect(result).toEqual([{ args: { foo: "bar", count: 42 } }])
	})

	it("returns array with multiple items unchanged", () => {
		const input = [
			{ meta: { name: "a" } },
			{ context: { baseURL: "http://example.com" } },
		]
		const result = toSetupOptsLayers(input)
		expect(result).toBe(input)
	})
})

describe("concatSetupOptsLayers", () => {
	it("returns empty array when called with no arguments", () => {
		expect(concatSetupOptsLayers()).toEqual([])
	})

	it("returns empty array for single undefined", () => {
		expect(concatSetupOptsLayers(undefined)).toEqual([])
	})

	it("returns empty array for multiple undefined", () => {
		expect(concatSetupOptsLayers(undefined, undefined)).toEqual([])
	})

	it("wraps single object in array", () => {
		expect(concatSetupOptsLayers({ meta: { name: "a" } })).toEqual([
			{ meta: { name: "a" } },
		])
	})

	it("returns array contents unchanged", () => {
		const result = concatSetupOptsLayers([
			{ meta: { name: "a" } },
			{ meta: { name: "b" } },
		])
		expect(result).toEqual([{ meta: { name: "a" } }, { meta: { name: "b" } }])
	})

	it("concatenates multiple single objects", () => {
		const result = concatSetupOptsLayers(
			{ meta: { name: "a" } },
			{ meta: { name: "b" } },
		)
		expect(result).toEqual([{ meta: { name: "a" } }, { meta: { name: "b" } }])
	})

	it("flattens mixed arrays and objects", () => {
		const result = concatSetupOptsLayers(
			[{ meta: { name: "a" } }],
			{ meta: { name: "b" } },
			[{ meta: { name: "c" } }, { meta: { name: "d" } }],
		)
		expect(result).toEqual([
			{ meta: { name: "a" } },
			{ meta: { name: "b" } },
			{ meta: { name: "c" } },
			{ meta: { name: "d" } },
		])
		expect(result).toHaveLength(4)
	})

	it("filters out undefined values between valid inputs", () => {
		const result = concatSetupOptsLayers(
			undefined,
			{ meta: { name: "a" } },
			undefined,
		)
		expect(result).toEqual([{ meta: { name: "a" } }])
	})

	it("handles empty arrays in the mix", () => {
		const result = concatSetupOptsLayers([], { meta: { name: "a" } }, [], {
			meta: { name: "b" },
		})
		expect(result).toEqual([{ meta: { name: "a" } }, { meta: { name: "b" } }])
	})

	it("handles complex nested structures", () => {
		const result = concatSetupOptsLayers(
			{ context: { baseURL: "http://a.com" } },
			[
				{ args: { x: 1 } },
				{
					meta: { name: "test" },
					context: { viewport: { width: 100, height: 200 } },
				},
			],
		)
		expect(result).toEqual([
			{ context: { baseURL: "http://a.com" } },
			{ args: { x: 1 } },
			{
				meta: { name: "test" },
				context: { viewport: { width: 100, height: 200 } },
			},
		])
	})
})

describe("mergeSetupOptsLayers", () => {
	it("returns empty object for empty array", () => {
		expect(mergeSetupOptsLayers([])).toEqual({})
	})

	it("returns single layer unchanged", () => {
		expect(mergeSetupOptsLayers([{ meta: { name: "a" } }])).toEqual({
			meta: { name: "a" },
		})
	})

	it("later layers override earlier for same keys", () => {
		const result = mergeSetupOptsLayers([
			{ meta: { name: "a" } },
			{ meta: { name: "b" } },
		])
		expect(result).toEqual({ meta: { name: "b" } })
	})

	it("deep merges nested context objects", () => {
		const result = mergeSetupOptsLayers([
			{ context: { baseURL: "http://a.com" } },
			{ context: { viewport: { width: 100, height: 200 } } },
		])
		expect(result).toEqual({
			context: {
				baseURL: "http://a.com",
				viewport: { width: 100, height: 200 },
			},
		})
	})

	it("deep merges args objects", () => {
		const result = mergeSetupOptsLayers([
			{ args: { foo: 1 } },
			{ args: { bar: 2 } },
		])
		expect(result).toEqual({ args: { foo: 1, bar: 2 } })
	})

	it("later args override earlier for same keys", () => {
		const result = mergeSetupOptsLayers([
			{ args: { foo: 1 } },
			{ args: { foo: 2 } },
		])
		expect(result).toEqual({ args: { foo: 2 } })
	})

	it("merges all three top-level properties", () => {
		const result = mergeSetupOptsLayers([
			{ meta: { name: "a" }, context: { baseURL: "http://a.com" } },
			{ args: { x: 1 } },
		])
		expect(result).toEqual({
			meta: { name: "a" },
			context: { baseURL: "http://a.com" },
			args: { x: 1 },
		})
	})

	it("handles three or more layers", () => {
		const result = mergeSetupOptsLayers([
			{ meta: { name: "first" } },
			{ context: { baseURL: "http://example.com" } },
			{ args: { key: "value" } },
			{ meta: { name: "last" } },
		])
		expect(result).toEqual({
			meta: { name: "last" },
			context: { baseURL: "http://example.com" },
			args: { key: "value" },
		})
	})

	it("handles empty objects in layers", () => {
		const result = mergeSetupOptsLayers([
			{ meta: { name: "a" } },
			{},
			{ args: { x: 1 } },
		])
		expect(result).toEqual({
			meta: { name: "a" },
			args: { x: 1 },
		})
	})

	it("deeply merges viewport within context", () => {
		const result = mergeSetupOptsLayers([
			{ context: { viewport: { width: 100, height: 200 } } },
			{ context: { viewport: { width: 300, height: 200 } } },
		])
		expect(result).toEqual({
			context: { viewport: { width: 300, height: 200 } },
		})
	})

	it("merges context with additional properties", () => {
		const result = mergeSetupOptsLayers([
			{ context: { baseURL: "http://a.com", locale: "en-US" } },
			{ context: { timezoneId: "America/New_York" } },
		])
		expect(result).toEqual({
			context: {
				baseURL: "http://a.com",
				locale: "en-US",
				timezoneId: "America/New_York",
			},
		})
	})

	it("handles undefined values in args", () => {
		const result = mergeSetupOptsLayers([
			{ args: { foo: 1, bar: 2 } },
			{ args: { foo: undefined } },
		])
		// undefined values should still be set (override behavior)
		expect(result.args).toHaveProperty("foo")
		expect(result.args?.bar).toBe(2)
	})
})

describe("mergeSetupOpts", () => {
	it("returns empty object for undefined", () => {
		expect(mergeSetupOpts(undefined)).toEqual({})
	})

	it("returns empty object for empty object input", () => {
		expect(mergeSetupOpts({})).toEqual({})
	})

	it("returns single object properties unchanged", () => {
		expect(mergeSetupOpts({ meta: { name: "a" } })).toEqual({
			meta: { name: "a" },
		})
	})

	it("merges array of layers", () => {
		const result = mergeSetupOpts([
			{ context: { baseURL: "http://a.com" } },
			{ context: { viewport: { width: 100, height: 200 } } },
		])
		expect(result).toEqual({
			context: {
				baseURL: "http://a.com",
				viewport: { width: 100, height: 200 },
			},
		})
	})

	it("later layers override earlier in array", () => {
		const result = mergeSetupOpts([
			{ meta: { name: "first" } },
			{ meta: { name: "second" } },
		])
		expect(result).toEqual({ meta: { name: "second" } })
	})

	it("returns empty object for empty array", () => {
		expect(mergeSetupOpts([])).toEqual({})
	})

	it("handles complex object with all properties", () => {
		const result = mergeSetupOpts({
			meta: { name: "test" },
			context: {
				baseURL: "http://example.com",
				viewport: { width: 800, height: 600 },
			},
			args: { debug: true, timeout: 5000 },
		})
		expect(result).toEqual({
			meta: { name: "test" },
			context: {
				baseURL: "http://example.com",
				viewport: { width: 800, height: 600 },
			},
			args: { debug: true, timeout: 5000 },
		})
	})

	it("handles array with single element", () => {
		const result = mergeSetupOpts([{ meta: { name: "only" } }])
		expect(result).toEqual({ meta: { name: "only" } })
	})

	it("handles null input", () => {
		// @ts-expect-error - testing runtime behavior with null
		expect(mergeSetupOpts(null)).toEqual({})
	})

	it("combines toSetupOptsLayers and mergeSetupOptsLayers behavior", () => {
		// This test verifies the function is a composition of the two
		const result = mergeSetupOpts([
			{ meta: { name: "a" }, args: { x: 1 } },
			{ context: { baseURL: "http://test.com" }, args: { x: 1, y: 2 } },
		])
		expect(result).toEqual({
			meta: { name: "a" },
			context: { baseURL: "http://test.com" },
			args: { x: 1, y: 2 },
		})
	})
})
