# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Also read `AGENTS.md` for shared agent conventions that apply across coding
assistants, especially CLI command shape and output consistency rules.

## Build and Development

This is a **pnpm monorepo** with two packages: `packages/cli` (the main `checkly` CLI) and `packages/create-cli` (the `create-checkly` scaffolding tool). Both are ESM-only TypeScript.

```bash
# Install dependencies
pnpm install

# Build everything (clean + compile + AI context)
pnpm --filter checkly run prepare
pnpm --filter create-checkly run prepare

# Watch mode for CLI development
pnpm --filter checkly run watch
```

## Testing

Unit tests use **Vitest**. The CLI package requires `pnpm pack` before running tests (the test script handles this) because the test sandbox installs the CLI from a tarball.

```bash
# Run all unit tests (both packages)
pnpm test

# Run a single test file (pnpm pack must have run first; `pnpm --filter checkly test` does this)
pnpm --filter checkly exec vitest --run src/services/check-parser/__tests__/parser.spec.ts

# Run tests matching a pattern
pnpm --filter checkly exec vitest --run -t "pattern"

# E2E tests (require CHECKLY_ACCOUNT_ID and CHECKLY_API_KEY)
pnpm --filter checkly run test:e2e

# E2E against local backend (localhost:3000)
pnpm --filter checkly run test:e2e:local
```

Unit tests live alongside source in `src/**/*.spec.ts`. E2E tests are in `e2e/__tests__/**/*.spec.ts` with a 15-second timeout.

**Test sandbox**: Tests that exercise CLI behavior use `FixtureSandbox` (from `src/testing/fixture-sandbox.ts`), which creates isolated temp directories with `checkly` installed from the packed tarball. Templates (`bare`, `playwright`, etc.) are pre-built in `global-setup.ts` and reused across tests.

## Linting

```bash
pnpm lint        # check
pnpm lint:fix    # auto-fix
```

Key ESLint rules enforced by `@stylistic` recommended + custom config:
- **No semicolons** (stylistic recommended default)
- **Space before function parens**: `function ()`, `method ()`, `async ()` — not `function()`
- **Arrow parens as-needed**: `x => x + 1` not `(x) => x + 1`
- No enums (use union types), no `console` outside commands/reporters
- Max 120 char lines, `require-await`, 1TBS brace style, always-multiline trailing commas, `object-shorthand: always`
- Operator line-breaks go before the operator (except `=`, `+=`)

## Commits

Conventional commits enforced by commitlint (max 100 char header). Pre-commit hook runs lint-staged on `*.{ts,js,mjs}` files.

## Architecture

### Constructs (the resource model)

The core abstraction is the `Construct` base class (`src/constructs/construct.ts`). Every Checkly resource (check, alert channel, dashboard, etc.) extends `Construct` and implements:
- `validate(diagnostics)` — reports configuration errors
- `bundle(bundler)` — prepares for deployment (e.g., packaging scripts into tarballs)
- `synthesize()` — produces the API-ready payload

`Project` (`src/constructs/project.ts`) is the root construct. It holds a typed map (`ProjectData`) of all resources keyed by type and logical ID.

`Session` is a static class on `Project` that carries global context during check file loading: the current project, available runtimes, check defaults, file loaders, and the path of the currently-loading check file.

To add a new construct, use `/new-monitor` or `/new-alert-channel` for step-by-step checklists.

### Check discovery and loading

`project-parser.ts` orchestrates discovery: it resolves glob patterns from `checkly.config.ts` (`checkMatch`, `browserCheckMatch`, `multiStepCheckMatch`), dynamically imports each matching file, and the constructs self-register with the `Session`/`Project` during import. File loading uses a pluggable `FileLoader` system (`src/loader/`): `NativeFileLoader` (Node's native TS support), `JitiFileLoader` (jiti), or `MixedFileLoader` (tries both in sequence).

### Check bundling and parsing

`src/services/check-parser/` handles dependency analysis and packaging:
- `parser.ts` — uses Acorn/TypeScript ESTree to extract imports and resolve npm dependencies
- `bundler.ts` — creates tar.gz archives of check code + dependencies, uploads to Checkly storage
- `playwright-config-expander.ts` — parses Playwright configs to extract test projects and patterns

### Command framework

Built on **oclif**. Commands live in `src/commands/`. `BaseCommand` provides engine-check and version headers. `AuthCommand` extends it for authenticated operations. Commands declare static metadata: `coreCommand`, `readOnly`, `destructive`, `idempotent`.

### Deploy flow

`deploy.ts` → load config → parse project (discover + instantiate) → bundle all constructs → validate → diff against remote state → create/update/delete resources via REST API.

### Test/trigger flow

`test.ts` → parse + bundle → `TestRunner.scheduleChecks()` → API creates a test session → results stream back over MQTT → reporters format output (`list`, `dot`, `ci`, `github`, `json`).

### REST client

Axios-based, in `src/rest/`. One API class per resource type. Request interceptor adds auth headers and CLI metadata. Base URL determined by `CHECKLY_API_URL` or `CHECKLY_ENV` (production/staging/local).

### AI context pipeline

Source in `src/ai-context/`, built during `prepare`. Generates examples from fixtures, produces public skills in `dist/ai-context/public-skills/`. The published copy at `skills/checkly/SKILL.md` must stay in sync — CI checks this. After modifying AI context sources, run the full prepare step, then `pnpm run sync:skills` from the repo root.

## Key Environment Variables

- `CHECKLY_ACCOUNT_ID`, `CHECKLY_API_KEY` — authentication
- `CHECKLY_ENV` — target environment (`production`, `staging`, `development`, `local`)
- `CHECKLY_API_URL` — override API base URL (used when `CHECKLY_ENV=local`)
- `CHECKLY_CLI_VERSION` — override reported CLI version (useful for testing `create-checkly`)
