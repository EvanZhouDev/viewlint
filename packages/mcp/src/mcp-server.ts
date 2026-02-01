import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { Page } from "playwright"
import type { LintMessage, LintResult, Scope, SetupOpts, View } from "viewlint"
import { ViewLint } from "viewlint"
import { defaultView, findNearestViewlintConfigFile } from "viewlint/config"

import type { GetConfigInput, LintUrlsInput } from "./types.js"
import { getConfigInputSchema, lintUrlsInputSchema } from "./types.js"

// Helper to count severities
function countSeverities(messages: LintMessage[]) {
	let errorCount = 0
	let warningCount = 0
	let infoCount = 0

	for (const message of messages) {
		if (message.severity === "error") errorCount += 1
		if (message.severity === "warn") warningCount += 1
		if (message.severity === "info") infoCount += 1
	}

	return { errorCount, warningCount, infoCount }
}

// Filter results for quiet mode (errors only)
function filterResultsForQuietMode(results: LintResult[]): LintResult[] {
	return results.map((result) => {
		const messages = result.messages.filter((m) => m.severity === "error")
		const counts = countSeverities(messages)

		return {
			...result,
			messages,
			suppressedMessages: [],
			errorCount: counts.errorCount,
			warningCount: 0,
			infoCount: 0,
			recommendCount: 0,
		}
	})
}

// Format results for MCP tool response - always JSON
function formatToolResults(
	results: LintResult[],
): Array<{ type: "text"; text: string }> {
	const type = "text" as const
	const content: Array<{ type: "text"; text: string }> = []

	// Summary statistics
	const totalErrors = results.reduce((sum, r) => sum + r.errorCount, 0)
	const totalWarnings = results.reduce((sum, r) => sum + r.warningCount, 0)
	const totalInfo = results.reduce((sum, r) => sum + r.infoCount, 0)

	content.push({
		type,
		text: `ViewLint Results Summary: ${totalErrors} error(s), ${totalWarnings} warning(s), ${totalInfo} info message(s) across ${results.length} URL(s).`,
	})

	// JSON format - structured for programmatic use
	content.push({
		type,
		text: JSON.stringify(results, null, 2),
	})

	content.push({
		type,
		text: "\nReview the issues above. If you were asked to fix issues, proceed with fixing them. Otherwise, summarize the findings and ask the user if they want you to address any issues.",
	})

	return content
}

// Initialize the MCP server
export const mcpServer = new McpServer({
	name: "ViewLint",
	version: "0.0.0",
})

// Main linting tool
mcpServer.registerTool(
	"lint",
	{
		title: "Lint URLs",
		description: `Lint one or more web page URLs for accessibility and UI issues using ViewLint.

ViewLint requires a configuration file to be defined, in the form of \`viewlint.config.js|ts|mjs\`. This file defines rules, views, options, and scopes for linting. ViewLint will not be able to function correctly without a valid configuration file, and views, options, and scopes must be defined in the configuration file.

**IMPORTANT**: Before running this tool, use the 'get-config' tool to discover which config file is being used. If no config file exists, the 'get-config' tool will inform you that you can create one for the user.

# Basic Usage:
Just provide one or more URLs to lint. ViewLint will load each page and check for accessibility issues, UI problems, and best practice violations.

# Advanced Features (optional):
- view: Use a named view from config (defines page setup like authentication, navigation)
- options: Apply named option layers (viewport size, cookies, storage state)
- scopes: Limit linting to specific named page sections
- selectors: Limit linting to elements matching CSS selectors
- quiet: Show only errors, hide warnings`,
		inputSchema: lintUrlsInputSchema,
	},
	async (input: LintUrlsInput) => {
		const {
			urls,
			configFile,
			view: viewName,
			options: optionNames,
			scopes: scopeNames,
			selectors,
			quiet = false,
		} = input

		try {
			const viewlint = new ViewLint({
				overrideConfigFile: configFile,
			})

			const resolved = await viewlint.getResolvedOptions()

			// Resolve named options from config
			const optionLayersFromRegistry = (optionNames ?? []).flatMap((name) => {
				const entry = resolved.optionsRegistry.get(name)
				if (!entry) {
					const known = [...resolved.optionsRegistry.keys()].sort()
					const knownMessage =
						known.length === 0
							? "No named options are defined in config."
							: `Known options: ${known.map((x) => `'${x}'`).join(", ")}.`
					throw new Error(`Unknown option '${name}'. ${knownMessage}`)
				}
				const layers = Array.isArray(entry) ? entry : [entry]
				return layers.map((layer) => {
					if (layer.meta?.name) return layer
					return { ...layer, meta: { ...(layer.meta ?? {}), name } }
				})
			})

			// Resolve named scopes from config
			const scopesFromRegistry = (scopeNames ?? []).flatMap((name) => {
				const entry = resolved.scopeRegistry.get(name)
				if (!entry) {
					const known = [...resolved.scopeRegistry.keys()].sort()
					const knownMessage =
						known.length === 0
							? "No named scopes are defined in config."
							: `Known scopes: ${known.map((x) => `'${x}'`).join(", ")}.`
					throw new Error(`Unknown scope '${name}'. ${knownMessage}`)
				}
				const scopes = Array.isArray(entry) ? entry : [entry]
				return scopes.map((scope): Scope => {
					if (scope.meta?.name) return scope
					return { ...scope, meta: { ...(scope.meta ?? {}), name } }
				})
			})

			// Create scopes from CSS selectors
			const selectorScopes = (selectors ?? []).map(
				(selector): Scope => ({
					meta: { name: selector },
					getLocator: ({ page }: { page: Page }) => page.locator(selector),
				}),
			)

			const resolvedScopes = [...scopesFromRegistry, ...selectorScopes]

			// Resolve view
			const resolveView = (): View => {
				if (viewName) {
					const view = resolved.viewRegistry.get(viewName)
					if (!view) {
						const known = [...resolved.viewRegistry.keys()].sort()
						const knownMessage =
							known.length === 0
								? "No named views are defined in config."
								: `Known views: ${known.map((x) => `'${x}'`).join(", ")}.`
						throw new Error(`Unknown view '${viewName}'. ${knownMessage}`)
					}
					if (view.meta?.name) return view
					return { ...view, meta: { ...(view.meta ?? {}), name: viewName } }
				}
				return defaultView
			}

			// Build targets for each URL
			const targets = urls.map((url) => {
				const urlLayer: SetupOpts[] = [{ context: { baseURL: url } }]

				return {
					view: resolveView(),
					options:
						urlLayer.length === 0 && optionLayersFromRegistry.length === 0
							? undefined
							: [...urlLayer, ...optionLayersFromRegistry],
					scope: resolvedScopes.length === 0 ? undefined : resolvedScopes,
				}
			})

			let results = await viewlint.lintTargets(targets)

			// Apply quiet mode filter
			if (quiet) {
				results = filterResultsForQuietMode(results)
			}

			const totalErrors = results.reduce((sum, r) => sum + r.errorCount, 0)

			const content = formatToolResults(results)

			return {
				content,
				isError: totalErrors > 0,
			}
		} catch (error) {
			return {
				content: [
					{
						type: "text",
						text: `Error running ViewLint: ${error instanceof Error ? error.message : String(error)}`,
					},
				],
				isError: true,
			}
		}
	},
)

// Tool to get config file path
mcpServer.registerTool(
	"get-config",
	{
		title: "Get ViewLint Config",
		description: `Get the path to the ViewLint configuration file currently being used.

This tool discovers and returns the path to the viewlint.config.ts|js|mjs file that ViewLint will use for linting. It searches from the server's working directory upward.

If no config file is found, the tool will inform you and you can offer to create one for the user.`,
		inputSchema: getConfigInputSchema,
	},
	async (input: GetConfigInput) => {
		const { configFile } = input

		try {
			// If a specific config file was requested, check it
			if (configFile) {
				return {
					content: [
						{
							type: "text",
							text: `Specified config file: ${configFile}`,
						},
					],
				}
			}

			// Otherwise, discover the config file
			const discoveredConfig = findNearestViewlintConfigFile()

			if (discoveredConfig) {
				return {
					content: [
						{
							type: "text",
							text: `ViewLint config file found: ${discoveredConfig}\n\nThis config file defines rules, views, options, and scopes for linting. You can now use the 'lint' tool to lint URLs using this configuration.`,
						},
					],
				}
			}

			// No config file found
			return {
				content: [
					{
						type: "text",
						text: `No ViewLint config file found in the current working directory or any parent directory.

ViewLint requires a configuration file in one of these formats:
- viewlint.config.ts
- viewlint.config.js
- viewlint.config.mjs

You can offer to create a basic viewlint.config.ts file for the user. A minimal config looks like:

\`\`\`typescript
import { defineConfig } from "viewlint/config";

export default defineConfig({
  rules: {
    // Add rules here
  },
  views: {
    // Define views here (e.g., mobile, desktop, logged-in)
  },
  options: {
    // Define reusable option layers
  },
  scopes: {
    // Define scope selectors here
  },
});
\`\`\`

Alternatively, you can ask the user to run \`npm init @viewlint/config\` for an interactive guided setup.`,
					},
				],
			}
		} catch (error) {
			return {
				content: [
					{
						type: "text",
						text: `Error discovering config: ${error instanceof Error ? error.message : String(error)}`,
					},
				],
				isError: true,
			}
		}
	},
)