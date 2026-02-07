# @viewlint/create-config

Interactive initializer for ViewLint configuration.

## Usage

```bash
npx @viewlint/create-config
```

Or:

```bash
npm init @viewlint/config
```

## What it does

- Asks which preset to use (`@viewlint/rules` recommended vs all)
- Asks whether to generate a TypeScript or JavaScript config
- Writes a `viewlint.config.ts` or `viewlint.config.mjs` file
- Optionally installs required dependencies as dev dependencies
- If you choose to install dependencies and no `package.json` exists, it can create a minimal one
