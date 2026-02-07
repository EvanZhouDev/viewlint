import { describe, expect, it } from "vitest"
import { formatterFromId } from "../src/formatter.js"
import { formatStylish } from "../src/formatters/stylish.js"
import type { LintMessage, LintResult } from "../src/types.js"

// Helper functions for creating test data
function createMessage(overrides: Partial<LintMessage> = {}): LintMessage {
	return {
		ruleId: overrides.ruleId ?? "test/rule",
		severity: overrides.severity ?? "error",
		message: overrides.message ?? "Test message",
		location: {
			element: {
				selector: overrides.location?.element.selector ?? "div.test",
				tagName: overrides.location?.element.tagName ?? "div",
				id: overrides.location?.element.id ?? "",
				classes: overrides.location?.element.classes ?? ["test"],
			},
		},
		relations: overrides.relations ?? [],
	}
}

function createResult(overrides: Partial<LintResult> = {}): LintResult {
	return {
		url: overrides.url ?? "http://example.com",
		target: overrides.target,
		messages: overrides.messages ?? [],
		suppressedMessages: overrides.suppressedMessages ?? [],
		errorCount: overrides.errorCount ?? 0,
		warningCount: overrides.warningCount ?? 0,
		infoCount: overrides.infoCount ?? 0,
		recommendCount: overrides.recommendCount ?? 0,
	}
}

describe("formatterFromId", () => {
	describe("stylish formatter (default)", () => {
		it("returns stylish formatter when id is undefined", () => {
			const formatter = formatterFromId(undefined)
			expect(formatter).toBeDefined()
			expect(typeof formatter.format).toBe("function")
		})

		it("returns stylish formatter when id is 'stylish'", () => {
			const formatter = formatterFromId("stylish")
			expect(formatter).toBeDefined()
			expect(typeof formatter.format).toBe("function")
		})

		it("trims whitespace from id for stylish", () => {
			const formatter = formatterFromId("  stylish  ")
			expect(formatter).toBeDefined()
			expect(typeof formatter.format).toBe("function")
		})
	})

	describe("json formatter", () => {
		it("returns json formatter when id is 'json'", () => {
			const formatter = formatterFromId("json")
			expect(formatter).toBeDefined()
			expect(typeof formatter.format).toBe("function")
		})

		it("trims whitespace from id for json", () => {
			const formatter = formatterFromId("  json  ")
			expect(formatter).toBeDefined()
			expect(typeof formatter.format).toBe("function")
		})

		it("outputs empty array as JSON with trailing newline", async () => {
			const formatter = formatterFromId("json")
			const output = await formatter.format([])
			expect(output).toBe("[]\n")
		})

		it("outputs results as pretty-printed JSON with 2-space indentation", async () => {
			const formatter = formatterFromId("json")
			const results = [createResult({ url: "http://test.com" })]
			const output = await formatter.format(results)

			// Should end with newline
			expect(output.endsWith("\n")).toBe(true)

			// Should be valid JSON
			const parsed = JSON.parse(output)
			expect(parsed).toEqual(results)

			// Should use 2-space indentation
			expect(output).toBe(`${JSON.stringify(results, null, 2)}\n`)
		})

		it("outputs complex results as valid JSON", async () => {
			const formatter = formatterFromId("json")
			const results = [
				createResult({
					url: "http://example.com/page1",
					messages: [createMessage({ ruleId: "a11y/alt-text" })],
					errorCount: 1,
				}),
				createResult({
					url: "http://example.com/page2",
					messages: [createMessage({ severity: "warn", ruleId: "perf/lazy" })],
					warningCount: 1,
				}),
			]
			const output = await formatter.format(results)

			const parsed = JSON.parse(output)
			expect(parsed).toHaveLength(2)
			expect(parsed[0].url).toBe("http://example.com/page1")
			expect(parsed[1].url).toBe("http://example.com/page2")
		})
	})

	describe("error handling", () => {
		it("throws error for unknown formatter id", () => {
			expect(() => formatterFromId("unknown")).toThrow(
				"Unknown formatter 'unknown'. Supported: 'stylish', 'json'.",
			)
		})

		it("throws error for unknown formatter with descriptive message", () => {
			expect(() => formatterFromId("xml")).toThrow(
				"Unknown formatter 'xml'. Supported: 'stylish', 'json'.",
			)
		})

		it("is case sensitive - STYLISH throws", () => {
			expect(() => formatterFromId("STYLISH")).toThrow(
				"Unknown formatter 'STYLISH'. Supported: 'stylish', 'json'.",
			)
		})

		it("is case sensitive - JSON throws", () => {
			expect(() => formatterFromId("JSON")).toThrow(
				"Unknown formatter 'JSON'. Supported: 'stylish', 'json'.",
			)
		})

		it("is case sensitive - mixed case throws", () => {
			expect(() => formatterFromId("Stylish")).toThrow(
				"Unknown formatter 'Stylish'. Supported: 'stylish', 'json'.",
			)
		})
	})
})

describe("formatStylish", () => {
	describe("empty results", () => {
		it("returns summary with zero problems for empty array", () => {
			const output = formatStylish([])
			expect(output).toContain("0 problems")
			expect(output).toContain("\u2714") // ✔ checkmark
		})

		it("ends with newline", () => {
			const output = formatStylish([])
			expect(output.endsWith("\n")).toBe(true)
		})
	})

	describe("single result with no messages", () => {
		it("returns header and zero problems summary", () => {
			const result = createResult({ url: "http://example.com/page" })
			const output = formatStylish([result])

			expect(output).toContain("http://example.com/page")
			expect(output).toContain("0 problems")
			expect(output).toContain("\u2714") // ✔ checkmark
		})

		it("displays URL in header", () => {
			const result = createResult({
				url: "https://test.example.org/path/to/page",
			})
			const output = formatStylish([result])

			expect(output).toContain("https://test.example.org/path/to/page")
		})
	})

	describe("message sorting", () => {
		it("sorts messages by severity - errors before warnings", () => {
			const result = createResult({
				messages: [
					createMessage({
						severity: "warn",
						ruleId: "warn-rule",
						message: "Warning msg",
					}),
					createMessage({
						severity: "error",
						ruleId: "error-rule",
						message: "Error msg",
					}),
				],
				errorCount: 1,
				warningCount: 1,
			})
			const output = formatStylish([result])

			const errorIndex = output.indexOf("error-rule")
			const warnIndex = output.indexOf("warn-rule")
			expect(errorIndex).toBeLessThan(warnIndex)
		})

		it("sorts messages by severity - warnings before info", () => {
			const result = createResult({
				messages: [
					createMessage({
						severity: "info",
						ruleId: "info-rule",
						message: "Info msg",
					}),
					createMessage({
						severity: "warn",
						ruleId: "warn-rule",
						message: "Warning msg",
					}),
				],
				warningCount: 1,
				infoCount: 1,
			})
			const output = formatStylish([result])

			const warnIndex = output.indexOf("warn-rule")
			const infoIndex = output.indexOf("info-rule")
			expect(warnIndex).toBeLessThan(infoIndex)
		})

		it("sorts messages by severity - errors before info", () => {
			const result = createResult({
				messages: [
					createMessage({
						severity: "info",
						ruleId: "info-rule",
						message: "Info msg",
					}),
					createMessage({
						severity: "error",
						ruleId: "error-rule",
						message: "Error msg",
					}),
				],
				errorCount: 1,
				infoCount: 1,
			})
			const output = formatStylish([result])

			const errorIndex = output.indexOf("error-rule")
			const infoIndex = output.indexOf("info-rule")
			expect(errorIndex).toBeLessThan(infoIndex)
		})

		it("sorts messages with same severity by ruleId alphabetically", () => {
			const result = createResult({
				messages: [
					createMessage({
						severity: "error",
						ruleId: "z-rule",
						message: "Z msg",
					}),
					createMessage({
						severity: "error",
						ruleId: "a-rule",
						message: "A msg",
					}),
					createMessage({
						severity: "error",
						ruleId: "m-rule",
						message: "M msg",
					}),
				],
				errorCount: 3,
			})
			const output = formatStylish([result])

			const aIndex = output.indexOf("a-rule")
			const mIndex = output.indexOf("m-rule")
			const zIndex = output.indexOf("z-rule")
			expect(aIndex).toBeLessThan(mIndex)
			expect(mIndex).toBeLessThan(zIndex)
		})

		it("sorts messages with same severity and ruleId by message alphabetically", () => {
			const result = createResult({
				messages: [
					createMessage({
						severity: "error",
						ruleId: "same-rule",
						message: "Zebra message",
					}),
					createMessage({
						severity: "error",
						ruleId: "same-rule",
						message: "Alpha message",
					}),
				],
				errorCount: 2,
			})
			const output = formatStylish([result])

			const alphaIndex = output.indexOf("Alpha message")
			const zebraIndex = output.indexOf("Zebra message")
			expect(alphaIndex).toBeLessThan(zebraIndex)
		})

		it("applies full sorting order: severity > ruleId > message", () => {
			const result = createResult({
				messages: [
					createMessage({
						severity: "info",
						ruleId: "a-rule",
						message: "First",
					}),
					createMessage({
						severity: "error",
						ruleId: "z-rule",
						message: "Second",
					}),
					createMessage({
						severity: "error",
						ruleId: "a-rule",
						message: "Third",
					}),
					createMessage({
						severity: "warn",
						ruleId: "a-rule",
						message: "Fourth",
					}),
				],
				errorCount: 2,
				warningCount: 1,
				infoCount: 1,
			})
			const output = formatStylish([result])

			// Expected order: error/a-rule, error/z-rule, warn/a-rule, info/a-rule
			const thirdIndex = output.indexOf("Third") // error, a-rule
			const secondIndex = output.indexOf("Second") // error, z-rule
			const fourthIndex = output.indexOf("Fourth") // warn, a-rule
			const firstIndex = output.indexOf("First") // info, a-rule

			expect(thirdIndex).toBeLessThan(secondIndex)
			expect(secondIndex).toBeLessThan(fourthIndex)
			expect(fourthIndex).toBeLessThan(firstIndex)
		})
	})

	describe("message formatting", () => {
		it("includes severity in message output", () => {
			const result = createResult({
				messages: [createMessage({ severity: "error" })],
				errorCount: 1,
			})
			const output = formatStylish([result])

			expect(output).toContain("error")
		})

		it("includes ruleId in message output", () => {
			const result = createResult({
				messages: [createMessage({ ruleId: "a11y/alt-text" })],
				errorCount: 1,
			})
			const output = formatStylish([result])

			expect(output).toContain("a11y/alt-text")
		})

		it("includes message text in output", () => {
			const result = createResult({
				messages: [
					createMessage({ message: "Image is missing alt attribute" }),
				],
				errorCount: 1,
			})
			const output = formatStylish([result])

			expect(output).toContain("Image is missing alt attribute")
		})

		it("includes element tagName in output", () => {
			const result = createResult({
				messages: [
					createMessage({
						location: {
							element: {
								selector: "img.hero",
								tagName: "img",
								id: "",
								classes: ["hero"],
							},
						},
					}),
				],
				errorCount: 1,
			})
			const output = formatStylish([result])

			expect(output).toContain("img")
		})

		it("includes element id in output when present", () => {
			const result = createResult({
				messages: [
					createMessage({
						location: {
							element: {
								selector: "div#main-content",
								tagName: "div",
								id: "main-content",
								classes: [],
							},
						},
					}),
				],
				errorCount: 1,
			})
			const output = formatStylish([result])

			expect(output).toContain("main-content")
		})

		it("includes element classes in output", () => {
			const result = createResult({
				messages: [
					createMessage({
						location: {
							element: {
								selector: "div.card.featured",
								tagName: "div",
								id: "",
								classes: ["card", "featured"],
							},
						},
					}),
				],
				errorCount: 1,
			})
			const output = formatStylish([result])

			expect(output).toContain("card")
			expect(output).toContain("featured")
		})

		it("includes element selector in output", () => {
			const result = createResult({
				messages: [
					createMessage({
						location: {
							element: {
								selector: "body > main > article:nth-child(2)",
								tagName: "article",
								id: "",
								classes: [],
							},
						},
					}),
				],
				errorCount: 1,
			})
			const output = formatStylish([result])

			expect(output).toContain("body > main > article:nth-child(2)")
		})
	})

	describe("message relations", () => {
		it("shows Related section when relations exist", () => {
			const result = createResult({
				messages: [
					createMessage({
						relations: [
							{
								description: "Referenced by this label",
								location: {
									element: {
										selector: "label.form-label",
										tagName: "label",
										id: "",
										classes: ["form-label"],
									},
								},
							},
						],
					}),
				],
				errorCount: 1,
			})
			const output = formatStylish([result])

			expect(output).toContain("Related")
		})

		it("includes relation description in output", () => {
			const result = createResult({
				messages: [
					createMessage({
						relations: [
							{
								description: "Associated form control",
								location: {
									element: {
										selector: "input#email",
										tagName: "input",
										id: "email",
										classes: [],
									},
								},
							},
						],
					}),
				],
				errorCount: 1,
			})
			const output = formatStylish([result])

			expect(output).toContain("Associated form control")
		})

		it("includes multiple relations", () => {
			const result = createResult({
				messages: [
					createMessage({
						relations: [
							{
								description: "First relation",
								location: {
									element: {
										selector: "div.first",
										tagName: "div",
										id: "",
										classes: ["first"],
									},
								},
							},
							{
								description: "Second relation",
								location: {
									element: {
										selector: "div.second",
										tagName: "div",
										id: "",
										classes: ["second"],
									},
								},
							},
						],
					}),
				],
				errorCount: 1,
			})
			const output = formatStylish([result])

			expect(output).toContain("First relation")
			expect(output).toContain("Second relation")
		})

		it("does not show Related section when relations array is empty", () => {
			const result = createResult({
				messages: [createMessage({ relations: [] })],
				errorCount: 1,
			})
			const output = formatStylish([result])

			// The word "Related" should not appear when there are no relations
			// But we need to be careful - it might appear in other contexts
			// So we check it doesn't appear as a section header pattern
			expect(output).not.toMatch(/Related:/)
		})
	})

	describe("multiple results", () => {
		it("displays header for each result", () => {
			const results = [
				createResult({ url: "http://example.com/page1" }),
				createResult({ url: "http://example.com/page2" }),
				createResult({ url: "http://example.com/page3" }),
			]
			const output = formatStylish(results)

			expect(output).toContain("http://example.com/page1")
			expect(output).toContain("http://example.com/page2")
			expect(output).toContain("http://example.com/page3")
		})

		it("groups messages under their respective result headers", () => {
			const results = [
				createResult({
					url: "http://example.com/page1",
					messages: [createMessage({ ruleId: "rule-for-page1" })],
					errorCount: 1,
				}),
				createResult({
					url: "http://example.com/page2",
					messages: [createMessage({ ruleId: "rule-for-page2" })],
					errorCount: 1,
				}),
			]
			const output = formatStylish(results)

			// Both rules should be present
			expect(output).toContain("rule-for-page1")
			expect(output).toContain("rule-for-page2")

			// Page1 header should come before its rule
			const page1Index = output.indexOf("page1")
			const rule1Index = output.indexOf("rule-for-page1")
			expect(page1Index).toBeLessThan(rule1Index)

			// Page2 header should come before its rule
			const page2Index = output.indexOf("page2")
			const rule2Index = output.indexOf("rule-for-page2")
			expect(page2Index).toBeLessThan(rule2Index)
		})
	})

	describe("summary line", () => {
		it("shows checkmark for zero problems", () => {
			const output = formatStylish([])
			expect(output).toContain("\u2714") // ✔
		})

		it("shows X mark for problems", () => {
			const result = createResult({
				messages: [createMessage()],
				errorCount: 1,
			})
			const output = formatStylish([result])
			expect(output).toContain("\u2716") // ✖
		})

		it("aggregates error counts from multiple results", () => {
			const results = [
				createResult({
					messages: [createMessage()],
					errorCount: 2,
				}),
				createResult({
					messages: [createMessage()],
					errorCount: 3,
				}),
			]
			const output = formatStylish(results)

			// Should show 5 problems total
			expect(output).toContain("5 problem")
			expect(output).toContain("5 error")
		})

		it("aggregates warning counts from multiple results", () => {
			const results = [
				createResult({
					messages: [createMessage({ severity: "warn" })],
					warningCount: 1,
				}),
				createResult({
					messages: [createMessage({ severity: "warn" })],
					warningCount: 2,
				}),
			]
			const output = formatStylish(results)

			expect(output).toContain("3 warning")
		})

		it("aggregates info counts from multiple results", () => {
			const results = [
				createResult({
					messages: [createMessage({ severity: "info" })],
					infoCount: 2,
				}),
				createResult({
					messages: [createMessage({ severity: "info" })],
					infoCount: 3,
				}),
			]
			const output = formatStylish(results)

			expect(output).toContain("5 info")
		})

		it("shows all count types when present", () => {
			const result = createResult({
				messages: [
					createMessage({ severity: "error" }),
					createMessage({ severity: "warn" }),
					createMessage({ severity: "info" }),
				],
				errorCount: 1,
				warningCount: 1,
				infoCount: 1,
			})
			const output = formatStylish([result])

			expect(output).toContain("3 problem")
			expect(output).toContain("1 error")
			expect(output).toContain("1 warning")
			expect(output).toContain("1 info")
		})

		it("only shows info count when greater than zero", () => {
			const result = createResult({
				messages: [createMessage({ severity: "error" })],
				errorCount: 1,
				warningCount: 0,
				infoCount: 0,
			})
			const output = formatStylish([result])

			expect(output).toContain("error")
			// Should not contain "0 info" - info is only shown when > 0
			expect(output).not.toMatch(/0 info/)
		})

		it("pluralizes problem correctly for single problem", () => {
			const result = createResult({
				messages: [createMessage()],
				errorCount: 1,
			})
			const output = formatStylish([result])

			expect(output).toMatch(/1 problem[^s]|1 problem$/)
		})

		it("pluralizes problem correctly for multiple problems", () => {
			const result = createResult({
				messages: [createMessage(), createMessage()],
				errorCount: 2,
			})
			const output = formatStylish([result])

			expect(output).toContain("2 problems")
		})
	})

	describe("edge cases", () => {
		it("handles result with empty URL", () => {
			const result = createResult({ url: "" })
			const output = formatStylish([result])

			expect(output).toBeDefined()
			expect(output.endsWith("\n")).toBe(true)
		})

		it("handles message with empty ruleId", () => {
			const result = createResult({
				messages: [createMessage({ ruleId: "" })],
				errorCount: 1,
			})
			const output = formatStylish([result])

			expect(output).toBeDefined()
			expect(output).toContain("Test message")
		})

		it("handles message with empty message text", () => {
			const result = createResult({
				messages: [createMessage({ message: "" })],
				errorCount: 1,
			})
			const output = formatStylish([result])

			expect(output).toBeDefined()
			expect(output).toContain("test/rule")
		})

		it("handles element with empty id and no classes", () => {
			const result = createResult({
				messages: [
					createMessage({
						location: {
							element: {
								selector: "div",
								tagName: "div",
								id: "",
								classes: [],
							},
						},
					}),
				],
				errorCount: 1,
			})
			const output = formatStylish([result])

			expect(output).toBeDefined()
			expect(output).toContain("div")
		})

		it("handles very long selector", () => {
			const longSelector =
				"body > div.container > main#content > section.hero > article.post:nth-child(5) > div.content"
			const result = createResult({
				messages: [
					createMessage({
						location: {
							element: {
								selector: longSelector,
								tagName: "div",
								id: "",
								classes: ["content"],
							},
						},
					}),
				],
				errorCount: 1,
			})
			const output = formatStylish([result])

			expect(output).toContain(longSelector)
		})

		it("handles special characters in message", () => {
			const result = createResult({
				messages: [
					createMessage({
						message:
							"Element <img> requires 'alt' attribute & must not be empty",
					}),
				],
				errorCount: 1,
			})
			const output = formatStylish([result])

			expect(output).toContain("<img>")
			expect(output).toContain("'alt'")
			expect(output).toContain("&")
		})

		it("handles unicode in message", () => {
			const result = createResult({
				messages: [
					createMessage({
						message: "Contrast ratio is 2.5:1, should be ≥ 4.5:1",
					}),
				],
				errorCount: 1,
			})
			const output = formatStylish([result])

			expect(output).toContain("≥")
		})

		it("returns only summary for results with only suppressedMessages", () => {
			const result = createResult({
				messages: [],
				suppressedMessages: [createMessage()],
				errorCount: 0,
				warningCount: 0,
				infoCount: 0,
			})
			const output = formatStylish([result])

			expect(output).toContain("0 problems")
		})
	})
})
