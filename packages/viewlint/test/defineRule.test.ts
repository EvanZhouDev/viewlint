import { describe, expect, it } from "vitest"
import { z } from "zod"
import { defineRule } from "../plugin/index.js"

describe("defineRule", () => {
	describe("identity behavior", () => {
		it("returns the exact same object reference", () => {
			const rule = {
				run: async () => {},
			}

			const result = defineRule(rule)

			expect(result).toBe(rule)
		})

		it("does not modify the input object", () => {
			const rule = {
				meta: {
					severity: "error" as const,
					docs: {
						description: "Test rule",
					},
				},
				run: async () => {},
			}

			const originalStringified = JSON.stringify(rule)
			defineRule(rule)

			expect(JSON.stringify(rule)).toBe(originalStringified)
		})

		it("preserves all properties unchanged", () => {
			const schema = z.object({ key: z.string() })
			const runFn = async () => {}
			const rule = {
				meta: {
					schema,
					severity: "warn" as const,
					defaultOptions: [{ key: "value" }] as [{ key: string }],
					docs: {
						description: "A test rule",
					},
				},
				run: runFn,
			}

			const result = defineRule(rule)

			expect(result.meta).toBe(rule.meta)
			expect(result.run).toBe(runFn)
			expect(result.meta?.severity).toBe("warn")
			expect(result.meta?.defaultOptions).toEqual([{ key: "value" }])
			expect(result.meta?.docs?.description).toBe("A test rule")
		})
	})

	describe("rules without meta", () => {
		it("accepts minimal rule with only run function", () => {
			const rule = {
				run: async () => {},
			}

			const result = defineRule(rule)

			expect(result).toBe(rule)
			expect(result.meta).toBeUndefined()
		})

		it("accepts rule with undefined meta", () => {
			const rule = {
				meta: undefined,
				run: async () => {},
			}

			const result = defineRule(rule)

			expect(result).toBe(rule)
			expect(result.meta).toBeUndefined()
		})
	})

	describe("rules with meta", () => {
		it("accepts rule with empty meta object", () => {
			const rule = {
				meta: {},
				run: async () => {},
			}

			const result = defineRule(rule)

			expect(result).toBe(rule)
			expect(result.meta).toEqual({})
		})

		it("accepts rule with severity", () => {
			const rule = {
				meta: {
					severity: "error" as const,
				},
				run: async () => {},
			}

			const result = defineRule(rule)

			expect(result).toBe(rule)
			expect(result.meta?.severity).toBe("error")
		})

		it("accepts rule with warn severity", () => {
			const rule = {
				meta: {
					severity: "warn" as const,
				},
				run: async () => {},
			}

			const result = defineRule(rule)

			expect(result.meta?.severity).toBe("warn")
		})

		it("accepts rule with info severity", () => {
			const rule = {
				meta: {
					severity: "info" as const,
				},
				run: async () => {},
			}

			const result = defineRule(rule)

			expect(result.meta?.severity).toBe("info")
		})

		it("accepts rule with docs", () => {
			const rule = {
				meta: {
					docs: {
						description: "Ensures components follow naming conventions",
					},
				},
				run: async () => {},
			}

			const result = defineRule(rule)

			expect(result).toBe(rule)
			expect(result.meta?.docs?.description).toBe(
				"Ensures components follow naming conventions",
			)
		})

		it("accepts rule with all meta fields (requires schema for defaultOptions)", () => {
			const schema = z.object({ threshold: z.number() })
			const rule = {
				meta: {
					schema,
					severity: "warn" as const,
					defaultOptions: [{ threshold: 10 }] as [{ threshold: number }],
					docs: {
						description: "Complete rule with all fields",
					},
				},
				run: async () => {},
			}

			const result = defineRule(rule)

			expect(result).toBe(rule)
			expect(result.meta?.severity).toBe("warn")
			expect(result.meta?.defaultOptions).toEqual([{ threshold: 10 }])
			expect(result.meta?.docs?.description).toBe(
				"Complete rule with all fields",
			)
		})
	})

	describe("rules with schema", () => {
		it("accepts rule with single zod schema", () => {
			const schema = z.object({
				maxLines: z.number(),
			})

			const rule = {
				meta: {
					schema,
				},
				run: async () => {},
			}

			const result = defineRule(rule)

			expect(result).toBe(rule)
			expect(result.meta?.schema).toBe(schema)
		})

		it("accepts rule with array of zod schemas", () => {
			const schemas = [
				z.object({ enabled: z.boolean() }),
				z.object({ threshold: z.number().optional() }),
			] as const

			const rule = {
				meta: {
					schema: schemas,
				},
				run: async () => {},
			}

			const result = defineRule(rule)

			expect(result).toBe(rule)
			expect(result.meta?.schema).toBe(schemas)
		})

		it("accepts rule with complex nested schema", () => {
			const schema = z.object({
				rules: z.array(
					z.object({
						pattern: z.string(),
						message: z.string().optional(),
						severity: z.enum(["warn", "error"]).default("error"),
					}),
				),
				ignore: z.array(z.string()).optional(),
			})

			const rule = {
				meta: {
					schema,
				},
				run: async () => {},
			}

			const result = defineRule(rule)

			expect(result).toBe(rule)
			expect(result.meta?.schema).toBe(schema)
		})

		it("accepts rule with schema and defaultOptions", () => {
			const schema = z.object({
				strict: z.boolean().default(false),
			})

			const rule = {
				meta: {
					schema,
					defaultOptions: [{ strict: true }] as [{ strict: boolean }],
				},
				run: async () => {},
			}

			const result = defineRule(rule)

			expect(result).toBe(rule)
			expect(result.meta?.schema).toBe(schema)
			expect(result.meta?.defaultOptions).toEqual([{ strict: true }])
		})

		it("accepts rule with schema and all other meta fields", () => {
			const schema = z.object({
				strict: z.boolean().default(false),
			})

			const rule = {
				meta: {
					schema,
					severity: "error" as const,
					defaultOptions: [{ strict: true }] as [{ strict: boolean }],
					docs: {
						description: "Rule with schema and complete meta",
					},
				},
				run: async () => {},
			}

			const result = defineRule(rule)

			expect(result).toBe(rule)
			expect(result.meta?.schema).toBe(schema)
			expect(result.meta?.severity).toBe("error")
			expect(result.meta?.defaultOptions).toEqual([{ strict: true }])
		})
	})

	describe("run function preservation", () => {
		it("preserves async run function", () => {
			const runFn = async () => {
				await Promise.resolve()
			}

			const rule = {
				run: runFn,
			}

			const result = defineRule(rule)

			expect(result.run).toBe(runFn)
		})

		it("preserves run function behavior", async () => {
			let executed = false
			const runFn = async () => {
				executed = true
			}

			const rule = {
				run: runFn,
			}

			const result = defineRule(rule)
			await result.run({} as unknown as Parameters<typeof result.run>[0])

			expect(executed).toBe(true)
		})
	})
})
