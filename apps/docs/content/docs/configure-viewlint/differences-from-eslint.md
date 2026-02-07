---
title: Differences from ESLint
description: Differences between ViewLint and ESLint Configuration
---

ViewLint is heavily inspired by ESLint.

If you already know ESLint, a lot of things will feel familiar (configuration, plugins, rules).
But there are some differences in the core principles that you need to understand before continuing.

## What gets linted

- ESLint lints **source files**.
    - This includes files, directories, globs, and so on
- ViewLint lints **rendered pages** (what a user actually sees in the browser).
    - ViewLint handles these in the form of **Targets**. These comprise of a:
        - **View**: How to open and prepare the page
        - **Options**: Inputs passed into **View**
        - **Scope**: What part of the page is linted

For a more general overview of this behavior, see [Core Concepts](/docs/core-concepts).
For a more detailed description of creating Views and Scope, see [Configure Views](/docs/configure-viewlint/configure-views) and [Configure Scope](/docs/configure-viewlint/configure-scope)

## Rules

Instead of running rules on an AST like ESLint, ViewLint runs rules on a DOM. Specifically, it runs them on a Playwright Page. This gives rules a lot of power, including reading the DOM elements, taking screenshots, and even interacting with the page. Here are some differences to note comparing this to ESLint:

- **Rules can mutate the page**: When this happens, they should self-declare as `hasSideEffects` and the ViewLint Engine will automatically reset the page using what you declared in the View
- **Rules have a default severity**: Unlike ESLint where rules are just patterns, ViewLint rules denote more than that and thus can also bundle a default severity.
    - These default severities can be `info`, `warn`, and `error` (which of course can be overridden by configuration)
    - `info` is a new severity that reports something that may be of interest, but is not necessarily wrong.

See [Configure Rules](/docs/configure-viewlint/configure-rules) for more information

## Rule Suppression

Instead of `eslint-disable` comments, ViewLint supports:

```html
<div data-viewlint-ignore="rules/text-contrast">...</div>
```

See [Configure Rules](/docs/configure-viewlint/configure-rules) for more information
