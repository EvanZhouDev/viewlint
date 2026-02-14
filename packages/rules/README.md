# @viewlint/rules

[GitHub](https://github.com/EvanZhouDev/viewlint) | [Documentation](https://viewlint.vercel.app/docs)

`@viewlint/rules` is the official first-party rules plugin for ViewLint.

It ships built-in UI lint rules and two ready-to-use presets: `rules/recommended` and `rules/all`.

## Installation

```bash
npm install --save-dev viewlint @viewlint/rules
```

## Usage

```ts
// viewlint.config.ts
import { defineConfig } from "viewlint/config";
import rules from "@viewlint/rules";

export default defineConfig({
  plugins: {
    rules,
  },
  extends: ["rules/recommended"],
});
```

## What This Package Does

- Registers the `rules` plugin namespace
- Exposes built-in rule definitions that run on rendered UI output
- Provides `rules/recommended` for high-signal defaults
- Provides `rules/all` for expanded feedback while polishing UI

## Included Rules

- `rules/hit-target-obscured`
- `rules/clipped-content`
- `rules/container-overflow`
- `rules/corner-radius-coherence`
- `rules/misalignment`
- `rules/overlapped-elements`
- `rules/space-misuse`
- `rules/text-overflow`
- `rules/text-contrast`
- `rules/text-proximity`
- `rules/text-ragged-lines`
- `rules/unexpected-scrollbar`

## Documentation

- [Rules Reference](https://viewlint.vercel.app/docs/rules-reference)
- [Configure Rules](https://viewlint.vercel.app/docs/configure-viewlint/configure-rules)
