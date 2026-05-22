# Add a New Monitor Construct

**Input:** $ARGUMENTS

Interpret the arguments as a description of the new monitor: its name, what it monitors, its custom properties, and its assertion sources. If arguments are missing or unclear, ask before proceeding.

Use an existing monitor as your reference implementation. For monitors with assertions and requests (the common case), use **IcmpMonitor** or **DnsMonitor**. For simpler constructs without assertions, use **HeartbeatMonitor**.

All paths below are relative to `packages/cli/` unless noted otherwise.

## Phase 1: Core Construct Files (new files)

Create these three files (skip assertion + request if the construct has no assertions):

- [ ] `src/constructs/{name}-monitor.ts` — Class extending `Monitor` (from `./monitor.js`). Define `{Name}MonitorProps` extending `MonitorProps`. Implement `constructor`, `describe()`, `validate()`, `synthesize()`. The constructor must call `Session.registerConstruct(this)`, `this.addSubscriptions()`, and `this.addPrivateLocationCheckAssignments()`. `synthesize()` must include `checkType: '{UPPER_NAME}'` and spread `super.synthesize()`.

- [ ] `src/constructs/{name}-assertion.ts` — Define `{Name}AssertionSource` union type, `{Name}Assertion` type alias using `CoreAssertion`, and `{Name}AssertionBuilder` class with static methods per assertion source. Use `NumericAssertionBuilder` for numeric sources (e.g., latency) and `GeneralAssertionBuilder` for text/JSON sources. Import builders from `./internal/assertion.js`.

- [ ] `src/constructs/{name}-request.ts` — Define `{Name}Request` interface with request configuration properties. Include an `assertions?: Array<{Name}Assertion>` field if assertions are supported.

## Phase 2: Code Generation Files (new files)

- [ ] `src/constructs/{name}-monitor-codegen.ts` — Class `{Name}MonitorCodegen` extending `Codegen<{Name}MonitorResource>`. Define `{Name}MonitorResource` extending `MonitorResource` with `checkType: '{UPPER_NAME}'`. Implement `describe()` and `gencode()`. Follow the exact pattern in `IcmpMonitorCodegen.gencode()`: resolve output path via `context.filePath()`, get file handle via `this.program.generatedConstructFile()`, add imports with `file.namedImport()`, emit the `new {Name}Monitor(...)` expression via `file.section()`, and call `buildMonitorProps()` from `./monitor-codegen.js`.

- [ ] `src/constructs/{name}-assertion-codegen.ts` — Export `valueFor{Name}Assertion()` function. Switch on `assertion.source`, delegate to `valueForNumericAssertion` or `valueForGeneralAssertion` from `./internal/assertion-codegen.js`.

- [ ] `src/constructs/{name}-request-codegen.ts` — Export `valueFor{Name}Request()` function. Build an object value with request fields, calling `valueFor{Name}Assertion()` for each assertion.

## Phase 3: Central Registry (modify existing files)

- [ ] `src/constructs/index.ts` — Add three export lines:
  ```
  export * from './{name}-monitor.js'
  export * from './{name}-assertion.js'
  export * from './{name}-request.js'
  ```

- [ ] `src/constructs/check-codegen.ts` — (1) Import `{Name}MonitorCodegen` and `{Name}MonitorResource`. (2) Add property `{name}MonitorCodegen: {Name}MonitorCodegen` to `CheckCodegen`. (3) Initialize in constructor. (4) Add `case '{UPPER_NAME}':` in both the `describe()` and `gencode()` switch statements.

- [ ] `src/constants.ts` — Add `{UPPER_NAME}: '{UPPER_NAME}'` to the `CheckTypes` object.

## Phase 4: Reporter and Formatter Integration (modify existing files)

- [ ] `src/reporters/util.ts` — Add `if (checkResult.checkType === '{UPPER_NAME}')` block in `formatCheckResult()`. Define `format{Name}Request()` and `format{Name}Response()` functions, and add subsections for request errors, connection errors, and assertions as appropriate. Follow the ICMP or DNS block as a template.

- [ ] `src/formatters/batch-stats.ts` — Add detection logic for the new check type in `buildColumns()` and add metric-specific columns if the construct has unique metrics (not standard response time).

- [ ] `src/rest/analytics.ts` — Add entry to `checkTypeToPath` map and `defaultMetrics` map.

## Phase 5: AI Context (new file + modify existing)

- [ ] `src/ai-context/references/configure-{name}-monitors.md` — New markdown reference. Follow the pattern of `configure-icmp-monitors.md`.

- [ ] `src/ai-context/context.ts` — Add entry to `REFERENCES` array and add an `{UPPER_NAME}_MONITOR` entry to `EXAMPLE_CONFIGS`.

## Phase 6: Tests (new files + modify existing)

- [ ] `src/constructs/__tests__/{name}-monitor.spec.ts` — Unit tests covering: default synthesis, group assignment, request properties, validation, assertion builder methods. Follow `icmp-monitor.spec.ts` as template.

- [ ] `e2e/__tests__/fixtures/deploy-project/{name}.check.ts` — Minimal construct instantiation with `activated: false`.

- [ ] `e2e/__tests__/deploy.spec.ts` — Add the new construct's logical ID to expected `Create:` output in deploy test assertions.

## Phase 7: Examples (new files, paths relative to repo root)

- [ ] `examples/advanced-project/src/__checks__/uptime/{name}.check.ts` — TypeScript example with group, assertions, and doc link comments.

- [ ] `examples/advanced-project-js/src/__checks__/uptime/{name}.check.js` — JavaScript equivalent.

## Phase 8: Build and Verify

- [ ] `pnpm --filter checkly run prepare` — Rebuild (compiles TS + regenerates AI context).
- [ ] `pnpm --filter checkly test` — Run unit tests.
- [ ] `pnpm run sync:skills` — Sync AI context to published skills (from repo root).
- [ ] `pnpm lint:fix` — Fix formatting (run from repo root).

## Naming Conventions

| Concept | Pattern | Example (ICMP) |
|---------|---------|----------------|
| File names | `{name}-monitor.ts` | `icmp-monitor.ts` |
| Class name | `{Name}Monitor` | `IcmpMonitor` |
| Props interface | `{Name}MonitorProps` | `IcmpMonitorProps` |
| Check type constant | `{UPPER_NAME}` | `ICMP` |
| Assertion builder | `{Name}AssertionBuilder` | `IcmpAssertionBuilder` |
| Request interface | `{Name}Request` | `IcmpRequest` |
| Codegen class | `{Name}MonitorCodegen` | `IcmpMonitorCodegen` |
| AI context reference | `configure-{name}-monitors.md` | `configure-icmp-monitors.md` |
