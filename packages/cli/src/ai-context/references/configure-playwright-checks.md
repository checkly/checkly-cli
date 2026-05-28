# Playwright Check Suites

- Import the `PlaywrightCheck` construct from `checkly/constructs`.
- `playwrightConfigPath` is resolved **relative to the `.check.ts` file that declares the construct**, not the project root. If your check lives in `monitoring/suites.check.ts` and your config in `playwright.config.ts` at the repo root, use `'../playwright.config.ts'`.
- use `pwProjects` if you're tasked to reuse a Playwright project. Values must match the `name` field of each project in your `playwright.config.ts` (e.g. `'Cart & Checkout'`), **not** the directory slug. Mismatched names deploy silently and resolve to zero tests.
- use `pwTags` if you're tasked to reuse a Playwright tag.
- Use `installCommand` only when the default package-manager install command is not enough.
- The Checkly runtime is **Linux, non-root, no C/C++ compiler**. Browsers (Chromium, Firefox, WebKit) are **pre-installed**, never install them.
- If `scripts.postinstall` (or `prepare`, `install`) references bundled files that won't exist at runtime (`bash scripts/...`, `.husky/...`), downloads browsers (`playwright install`, `puppeteer install`), sets up git hooks, or compiles native code (`node-gyp`): use `--ignore-scripts` and rebuild deps separately.

- For custom dependencies, rely on the user's `package.json` and lock file. Do not add dependencies to the check code manually.
- For private packages or custom registries, include the registry config file, usually `.npmrc`, with the Playwright check `include` property. The `.npmrc` should reference a Checkly environment variable, for example `${NPM_TOKEN}`, and that token must be set in Checkly before deploy or trigger.
- In Checkly CLI v8.0.0 and later, Playwright Check Suite `include` patterns resolve relative to the directory of the Playwright config file, not the project root. Example: if `playwrightConfigPath` is `./e2e/playwright.config.ts` and `.npmrc` is at the repo root, use `include: ["../.npmrc"]`.

- Omit `engine` unless the user explicitly asks to override the JavaScript engine or version. If needed, import `Engine` from `checkly/constructs` and set `engine: Engine.node('24')` or `engine: Engine.bun('1.3')`. When no engine is configured or detected, Checkly defaults to Node.js 22.
- Node.js engine majors map to pinned patch versions: `22` -> `22.14.0`, `24` -> `24.13.1`, and `26` -> `26.2.0`.

```typescript
import { PlaywrightCheck } from "checkly/constructs"

new PlaywrightCheck("checkout-suite", {
  name: "Checkout suite",
  playwrightConfigPath: "./e2e/playwright.config.ts",
  // Include root .npmrc for private package or registry auth.
  include: ["../.npmrc"],
})
```

<!-- EXAMPLE: PLAYWRIGHT_CHECK -->
