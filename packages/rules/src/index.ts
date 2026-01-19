import type { Plugin, RuleDefinition, RuleSchema } from "viewlint"

import clippedContent from "./rules/clipped-content.js"
import containerOverflow from "./rules/container-overflow.js"
import cornerRadiusCoherence from "./rules/corner-radius-coherence.js"
import hitTargetObscured from "./rules/hit-target-obscured.js"
import misalignment from "./rules/misalignment.js"
import overlappedElements from "./rules/overlapped-elements.js"
import spaceMisuse from "./rules/space-misuse.js"
import textContrast from "./rules/text-contrast.js"
import textOverflow from "./rules/text-overflow.js"
import textProximity from "./rules/text-proximity.js"
import textRaggedLines from "./rules/text-ragged-lines.js"
import unexpectedScrollbar from "./rules/unexpected-scrollbar.js"

const rules: Record<string, RuleDefinition<RuleSchema | undefined>> = {
	"hit-target-obscured": hitTargetObscured,
	"clipped-content": clippedContent,
	"container-overflow": containerOverflow,
	"corner-radius-coherence": cornerRadiusCoherence,
	misalignment: misalignment,
	"overlapped-elements": overlappedElements,
	"space-misuse": spaceMisuse,
	"text-overflow": textOverflow,
	"text-contrast": textContrast,
	"text-proximity": textProximity,
	"text-ragged-lines": textRaggedLines,
	"unexpected-scrollbar": unexpectedScrollbar,
}

const recommendedPlugins: Record<string, Plugin> = {}
const allPlugins: Record<string, Plugin> = {}

const plugin = {
	meta: {
		name: "@viewlint/rules",
		docs: {},
	},
	rules,
	configs: {
		recommended: {
			rules: {
				"rules/hit-target-obscured": "error",
				"rules/clipped-content": "error",
				"rules/container-overflow": "error",
				"rules/overlapped-elements": "error",
				"rules/text-overflow": "error",
				"rules/text-contrast": "warn",
				"rules/unexpected-scrollbar": "error",
			} satisfies Record<string, "error" | "warn" | "info">,
			plugins: recommendedPlugins,
		},
		all: {
			rules: {
				"rules/hit-target-obscured": "error",
				"rules/clipped-content": "error",
				"rules/container-overflow": "error",
				"rules/corner-radius-coherence": "warn",
				"rules/misalignment": "warn",
				"rules/overlapped-elements": "error",
				"rules/space-misuse": "warn",
				"rules/text-overflow": "error",
				"rules/text-contrast": "warn",
				"rules/text-proximity": "warn",
				"rules/text-ragged-lines": "warn",
				"rules/unexpected-scrollbar": "error",
			} satisfies Record<string, "error" | "warn" | "info">,
			plugins: allPlugins,
		},
	},
}

recommendedPlugins.rules = plugin
allPlugins.rules = plugin

export default plugin
