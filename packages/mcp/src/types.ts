import { z } from "zod"

// Main lint-urls tool schema - simple by default, advanced options available
export const lintUrlsInputSchema = {
	urls: z
		.array(z.url())
		.min(1)
		.describe("One or more URLs to lint (e.g. https://example.com)"),
	configFile: z
		.string()
		.min(1)
		.optional()
		.describe(
			"Path to a specific viewlint config file. If omitted, uses the default config from the server's working directory. Use the 'get-config' tool to discover the config file being used.",
		),
	view: z
		.string()
		.optional()
		.describe(
			"Use a named view from the config. Views define how the page is loaded and set up before linting.",
		),
	options: z
		.array(z.string())
		.optional()
		.describe(
			"Apply named option layers from config (in order). Options can set viewport, authentication, or other context.",
		),
	scopes: z
		.array(z.string())
		.optional()
		.describe(
			"Apply named scopes from config (in order). Scopes limit linting to specific parts of the page.",
		),
	selectors: z
		.array(z.string())
		.optional()
		.describe(
			"Ad-hoc CSS selectors to use as additional scope roots. Limits linting to elements matching these selectors.",
		),
	quiet: z
		.boolean()
		.optional()
		.describe(
			"If true, only report errors (hide warnings and info messages). Default: false.",
		),
}

export type LintUrlsInput = z.infer<z.ZodObject<typeof lintUrlsInputSchema>>

// Get config tool schema
export const getConfigInputSchema = {
	configFile: z
		.string()
		.min(1)
		.optional()
		.describe(
			"Optional path to check a specific config file. If omitted, discovers the config from the server's working directory.",
		),
}

export type GetConfigInput = z.infer<z.ZodObject<typeof getConfigInputSchema>>
