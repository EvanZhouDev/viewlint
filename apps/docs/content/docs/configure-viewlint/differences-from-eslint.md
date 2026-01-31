---
title: Differences from ESLint
description: Differences between ViewLint and ESLint Configuration
---

ViewLint is heavily inspired by ESLint.

If you already know ESLint, a lot of things will feel familiar (plugins, rules, recommended presets). But ViewLint is a UI linter, so a few core ideas are different.

## What gets linted

- ESLint lints **source files**.
- ViewLint lints **rendered pages** (what a user actually sees in the browser).

## Targets vs files

In ESLint, you usually pass files/directories/globs.

In ViewLint, the unit of linting is a **Target**:

- a View (how to open and prepare the page)
- option layers (like `baseURL`)
- an optional scope (which part of the page to lint)

Passing a URL on the CLI is just a convenience that creates a Target for you.

See: [Configure Views](/docs/configure-viewlint/configure-views) and [Configure Scope](/docs/configure-viewlint/configure-scope)

## Views are first-class

UI linting often needs “setup” that code linting doesn’t:

- logging in
- navigating to a route
- opening a modal
- waiting for data to load

That’s what Views are for.

## Scope is DOM-based

ViewLint “scope” is about **DOM regions**, not files.

You can scope a run to a subtree with named scopes or `--selector`.

See: [Configure Scope](/docs/configure-viewlint/configure-scope)

## Suppression is HTML-based

Instead of `eslint-disable` comments, ViewLint supports:

```html
<div data-viewlint-ignore="rules/text-contrast">...</div>
```

See: [Configure Rules](/docs/configure-viewlint/configure-rules)

## Feature gaps (for now)

ViewLint is early-stage. Some common ESLint features don’t exist yet in ViewLint, including:

- file globbing / per-file config
- autofix (`--fix`)
- formatter ecosystem
