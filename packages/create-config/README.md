# @viewlint/create-config

`@viewlint/create-config` is the interactive initializer for ViewLint configuration files.

## Usage

```bash
npx @viewlint/create-config@latest
```

Or:

```bash
npm init @viewlint/config@latest
```

## What it does

- Asks which preset to use (`rules/recommended` or `rules/all`)
- Asks whether to generate TypeScript or JavaScript config
- Writes a `viewlint.config.ts` or `viewlint.config.mjs` file
- Optionally installs `viewlint` and `@viewlint/rules`
- If no `package.json` exists, can create one before installing dependencies

## When to use it

- First-time ViewLint setup
- Fast project bootstrap in a repo that does not yet have `viewlint.config.*`
- Standardizing setup across multiple projects

For more info, see [Getting Started](https://viewlint.vercel.app/docs/getting-started) in the ViewLint Documentation.
