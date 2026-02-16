# viewlint/config

`viewlint/config` is a subpath export providing configuration helpers exported from `viewlint`. This is not a separate NPM package.

## Installation

Install `viewlint`:

```bash
npm install --save-dev viewlint
```

Then import from `viewlint/config`.

## What This Module Does

- `defineConfig(...)`: compose typed config objects/arrays and resolve `extends`
- `defineViewFromActions(...)`: build reusable views from setup actions
- `defaultView`: default view used when linting URLs directly
- `findNearestViewlintConfigFile()`: discover the nearest config file path

## Usage

```ts
// viewlint.config.ts
import { defineConfig, defineViewFromActions } from "viewlint/config";
import rules from "@viewlint/rules";

export default defineConfig({
  plugins: { rules },
  extends: ["rules/recommended"],
  views: {
    loggedIn: defineViewFromActions([
      async ({ page }) => {
        await page.goto("/");
        await page.getByRole("button", { name: "Open Menu" }).click();
      },
    ]),
  },
});
```

## Documentation

- [Configuration Files](https://viewlint.vercel.app/docs/configure-viewlint/configuration-files)
- [Configure Views](https://viewlint.vercel.app/docs/configure-viewlint/configure-views)
