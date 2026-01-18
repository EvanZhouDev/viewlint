import type { RuleDefinition, RuleMeta, RuleSchema } from "../src/types.js"

export function defineRule<Schema extends RuleSchema>(
	rule: RuleDefinition<Schema> & {
		meta: RuleMeta<Schema> & { schema: Schema }
	},
): RuleDefinition<Schema>

export function defineRule(
	rule: RuleDefinition<undefined>,
): RuleDefinition<undefined>

export function defineRule<Schema extends RuleSchema | undefined>(
	rule: RuleDefinition<Schema>,
): RuleDefinition<Schema> {
	return rule
}
