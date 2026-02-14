# viewlint

[GitHub](https://github.com/EvanZhouDev/viewlint) | [Documentation](https://viewlint.vercel.app/docs)

`viewlint` is the core ViewLint package. It provides the `viewlint` CLI and the `ViewLint` class for programmatic linting.

## Quick Start (Recommended)

Initialize ViewLint:

```bash
npm init @viewlint/config@latest
```

Run it on a URL:

```bash
npx viewlint https://example.com
```

## What This Package Does

- Discovers and loads `viewlint.config.ts`, `viewlint.config.mjs`, or `viewlint.config.js`
- Resolves views, options, and scopes into executable lint targets
- Runs rules on Playwright-rendered pages
- Supports formatters (`stylish`, `json`) and machine-friendly exit codes
- Exposes configuration helpers from `viewlint/config`

## Related Packages

- [`@viewlint/rules`](https://www.npmjs.com/package/@viewlint/rules): built-in rules and presets
- [`@viewlint/create-config`](https://www.npmjs.com/package/@viewlint/create-config): interactive config setup
- [`@viewlint/mcp`](https://www.npmjs.com/package/@viewlint/mcp): MCP server

## Documentation

- [Getting Started](https://viewlint.vercel.app/docs/getting-started)
- [CLI Reference](https://viewlint.vercel.app/docs/cli-reference)
- [TypeScript API Reference](https://viewlint.vercel.app/docs/typescript-api-reference)
