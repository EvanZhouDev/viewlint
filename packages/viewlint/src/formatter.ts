import { formatStylish } from "./formatters/stylish.js"
import type { LoadedFormatter } from "./types.js"

export function formatterFromId(id: string | undefined): LoadedFormatter {
	const normalized = (id ?? "stylish").trim()

	if (normalized === "stylish") {
		return { format: formatStylish }
	}

	if (normalized === "json") {
		return {
			format(results) {
				return `${JSON.stringify(results, null, 2)}\n`
			},
		}
	}

	throw new Error(
		`Unknown formatter '${normalized}'. Supported: 'stylish', 'json'.`,
	)
}
