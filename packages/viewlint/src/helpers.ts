import type { RuleDefinition } from "./types.js"

function unknownRuleError(
	ruleId: string,
	ruleRegistry: Map<string, RuleDefinition>,
): Error {
	const availableRules = [...ruleRegistry.keys()].sort()
	const availableRulesMessage =
		availableRules.length === 0
			? "No rules are registered; did you forget to configure a plugin?"
			: `Available rules: ${availableRules
					.map((availableRuleId) => `'${availableRuleId}'`)
					.join(", ")}.`

	return new Error(`Unknown rule '${ruleId}'. ${availableRulesMessage}`)
}

export function resolveRuleId(
	ruleId: string,
	ruleRegistry: Map<string, RuleDefinition>,
): string {
	if (ruleRegistry.has(ruleId)) return ruleId
	if (ruleId.includes("/")) throw unknownRuleError(ruleId, ruleRegistry)

	const candidates = [...ruleRegistry.keys()].filter((knownRuleId) => {
		return knownRuleId.endsWith(`/${ruleId}`)
	})

	if (candidates.length === 0) throw unknownRuleError(ruleId, ruleRegistry)
	if (candidates.length === 1) {
		if (candidates[0]) {
			return candidates[0]
		}

		throw new Error(`Unexpected error resolving rule ID '${ruleId}'.`)
	} else if (candidates.length > 1) {
		candidates.sort()
		throw new Error(
			`Ambiguous rule '${ruleId}'. Use a fully-qualified rule ID. Matches: ${candidates
				.map((candidate) => `'${candidate}'`)
				.join(", ")}.`,
		)
	}

	return ruleId
}

export function safeCast<T>(value: T): T {
	return value
}
