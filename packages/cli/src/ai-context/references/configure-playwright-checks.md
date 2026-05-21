# Playwright Check Suites

- Import the `PlaywrightCheck` construct from `checkly/constructs`.
- `playwrightConfigPath` is resolved **relative to the `.check.ts` file that declares the construct**, not the project root. If your check lives in `monitoring/suites.check.ts` and your config in `playwright.config.ts` at the repo root, use `'../playwright.config.ts'`.
- use `pwProjects` if you're tasked to reuse a Playwright project. Values must match the `name` field of each project in your `playwright.config.ts` (e.g. `'Cart & Checkout'`), **not** the directory slug. Mismatched names deploy silently and resolve to zero tests.
- use `pwTags` if you're tasked to reuse a Playwright tag.

<!-- EXAMPLE: PLAYWRIGHT_CHECK -->
