import { describe, expect, it } from "vitest"
import plugin from "../src/index.js"

describe("@viewlint/rules", () => {
	it("exports plugin metadata and rules", () => {
		expect(plugin.meta.name).toBe("@viewlint/rules")
		expect(Object.keys(plugin.rules).length).toBeGreaterThan(0)
	})

	it("recommended config only references known rule ids", () => {
		const knownRuleIds = new Set(Object.keys(plugin.rules))
		for (const [ruleId, severity] of Object.entries(
			plugin.configs.recommended.rules,
		)) {
			expect(ruleId.startsWith("rules/")).toBe(true)
			expect(knownRuleIds.has(ruleId.slice("rules/".length))).toBe(true)
			expect(["error", "warn", "info"]).toContain(severity)
		}
	})

	it("all config includes every known rule id", () => {
		const allRuleIds = Object.keys(plugin.rules)
			.map((ruleName) => `rules/${ruleName}`)
			.sort()

		const configuredRuleIds = Object.keys(plugin.configs.all.rules).sort()
		expect(configuredRuleIds).toEqual(allRuleIds)
	})
})
