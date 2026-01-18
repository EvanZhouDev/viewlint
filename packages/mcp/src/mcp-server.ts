import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { LintResult } from "viewlint"
import { ViewLint } from "viewlint"

import type { LintUrlsInput } from "./types.js"
import { lintUrlsInputSchema } from "./types.js"

function formatToolResults(
	results: LintResult[],
): Array<{ type: "text"; text: string }> {
	const type = "text" as const

	const content = results.map((result) => {
		return {
			type,
			text: JSON.stringify(result),
		}
	})

	content.unshift({
		type,
		text: "Here are the results of running ViewLint on the provided URLs. Before doing anything else, you must display the full list to the user:",
	})

	content.push({
		type,
		text: "If the user asked to fix any issues found, proceed in fixing them. If the user did not ask to fix issues found, you must ask the user for confirmation before attempting to fix the issues found.",
	})

	return content
}

export const mcpServer = new McpServer({
	name: "ViewLint",
	version: "0.0.0",
})

const urlsSchema = lintUrlsInputSchema

mcpServer.registerTool(
	"lint-urls",
	{
		description:
			"Lint URLs using ViewLint. You must provide a list of URLs to lint (e.g. https://example.com). Optionally provide a configFile path to force a specific viewlint config file. Otherwise, it uses the default configuration file in the directory the sever was initiated in.",

		inputSchema: urlsSchema,
	},
	async ({ urls, configFile }: LintUrlsInput) => {
		const viewlint = new ViewLint({
			overrideConfigFile: configFile,
		})
		const results = await viewlint.lintUrls(urls)

		return {
			content: formatToolResults(results),
		}
	},
)
