# Playwright Check Suites

- Import the `PlaywrightCheck` construct from `checkly/constructs`.
- Use Playwright Check Suites to run an existing Playwright project. Do not rewrite tests as Browser or Multistep Checks unless the user asks.
- Set `playwrightConfigPath` relative to the `.check.ts` file that declares the construct, not the project root. If the check is in `monitoring/suites.check.ts` and the config is at the repo root, use `"../playwright.config.ts"`.
- Use `pwProjects` only when the user wants specific Playwright projects. Values must match the Playwright project `name`, such as `"Cart & Checkout"`, not a folder or slug. Wrong names can deploy but run zero tests.
- Use `pwTags` only when the user wants tag-based selection.

## Dependencies

- Use the user's `package.json` and lock file for dependencies. Do not add dependency declarations to check code.
- For private packages or custom registries, include the registry config file, usually `.npmrc`, with `include`.
- The `.npmrc` should reference a Checkly environment variable such as `${NPM_TOKEN}`. Tell the user that the token must exist in Checkly before `deploy` or `trigger`.
- Use `installCommand` only when the default package-manager install command is not enough.
- In Checkly CLI v8.0.0 and later, `include` patterns resolve relative to the Playwright config directory, not the project root. If `playwrightConfigPath` points to a subdirectory, adjust `include` globs. Example: `playwrightConfigPath: "./e2e/playwright.config.ts"` with root `.npmrc` needs `include: ["../.npmrc"]`.

## Install troubleshooting

- The execution environment is Linux and non-root, and it does not include a C/C++ compiler. Browsers are pre-installed, so never add `playwright install`, `npx playwright install`, Puppeteer browser downloads, or similar browser installation commands.
- If `scripts.postinstall`, `scripts.prepare`, or `scripts.install` references missing files, downloads browsers, sets up git hooks, or compiles native code, set `installCommand` to skip project lifecycle scripts and rebuild dependency scripts:
  - npm: `npm install --ignore-scripts && npm rebuild`
  - pnpm: `pnpm install --ignore-scripts && pnpm rebuild`
- Flag likely dependency problems before suggesting a deploy:
  - `puppeteer` is usually unnecessary because browsers are pre-installed.
  - Native dependencies that require a compiler, such as `sharp` or `better-sqlite3`, may fail.
  - `fsevents` must be optional; a locked non-optional `fsevents` dependency can fail on Linux.
  - `workspace:*` dependencies must be included in the uploaded bundle.
  - Private registries must have auth configured through Checkly environment variables.

## Runtime model

- Do not use `runtimeId` for Playwright Check Suites. Browser and Multistep Checks use `runtimeId`; Playwright Check Suites use project dependencies plus `engine`.
- Omit `engine` unless the user explicitly asks to override the JavaScript engine or version.
- If an engine override is needed, import `Engine` from `checkly/constructs` and use `Engine.node("24")` or `Engine.bun("1.3")`.
- If no engine is configured or detected, Checkly defaults to Node.js 22. Node.js engine majors map to pinned patch versions: `22` -> `22.14.0`, `24` -> `24.13.1`, and `26` -> `26.2.0`.

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
