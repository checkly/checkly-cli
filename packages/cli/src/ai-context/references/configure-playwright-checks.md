# Playwright Check Suites

- Import the `PlaywrightCheck` construct from `checkly/constructs`.
- `playwrightConfigPath` is resolved **relative to the `.check.ts` file that declares the construct**, not the project root. If your check lives in `monitoring/suites.check.ts` and your config in `playwright.config.ts` at the repo root, use `'../playwright.config.ts'`.
- use `pwProjects` if you're tasked to reuse a Playwright project. Values must match the `name` field of each project in your `playwright.config.ts` (e.g. `'Cart & Checkout'`), **not** the directory slug. Mismatched names deploy silently and resolve to zero tests.
- use `pwTags` if you're tasked to reuse a Playwright tag.
- Use `include` only for non-code assets that specs read via `fs` at runtime (markdown, JSON fixtures, snapshots). Test files and anything reachable through `import` are already bundled via Playwright's project discovery and the import graph — listing them in `include` is redundant. Globs resolve **relative to the directory of `playwrightConfigPath`**, not the project root and not the `.check.ts`.
- For env vars Checkly exposes at runtime (e.g. `CHECKLY=1` for "am I running on Checkly?"), see `npx checkly skills configure environment`.

<!-- EXAMPLE: PLAYWRIGHT_CHECK -->
