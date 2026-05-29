# Add a New Alert Channel Construct

**Input:** $ARGUMENTS

Interpret the arguments as a description of the new alert channel: its name, what service it integrates with, and its configuration properties. If arguments are missing or unclear, ask before proceeding.

There are two alert channel families:

- **Webhook-based** (e.g., Telegram, Incident.io, MS Teams) — extends `WebhookAlertChannel`, routes through `webhook-alert-channel-codegen.ts`. Use **TelegramAlertChannel** as reference.
- **Standalone** (e.g., Slack, Opsgenie, PagerDuty) — extends `AlertChannel` directly, routes through `alert-channel-codegen.ts`. Use **SlackAlertChannel** as reference.

Determine which family applies based on the integration. If unsure, ask.

All paths below are relative to `packages/cli/`.

## Phase 1: Core Construct File (new file)

- [ ] `src/constructs/{name}-alert-channel.ts`
  - **Webhook-based**: Class extending `WebhookAlertChannel`. Define `{Name}AlertChannelProps` extending `AlertChannelProps`. In the constructor, call `super(logicalId, props)` (add `// @ts-ignore` above the call — the props type mismatch with `WebhookAlertChannelProps` is expected), then set `this.webhookType = 'WEBHOOK_{UPPER_NAME}'`, `this.method`, `this.url`, and `this.template`. Implement `describe()` and `synthesize()` (synthesize returns `type: 'WEBHOOK'` with a `config` object containing `name`, `webhookType`, `url`, `template`, `method`, `headers`, `queryParameters`, `webhookSecret`).
  - **Standalone**: Class extending `AlertChannel`. Define `{Name}AlertChannelProps` extending `AlertChannelProps`. In the constructor, call `super(logicalId, props)` and `Session.registerConstruct(this)`. Implement `describe()` and `synthesize()` (synthesize returns a unique `type` string and a `config` object with channel-specific properties).

## Phase 2: Code Generation File (new file)

- [ ] `src/constructs/{name}-alert-channel-codegen.ts`
  - Class `{Name}AlertChannelCodegen` extending `Codegen<{Name}AlertChannelResource>`.
  - Define `{Name}AlertChannelResource` interface extending the appropriate parent (`WebhookAlertChannelResource` or `AlertChannelResource`).
  - Implement `describe()`, `prepare()`, and `gencode()`. For **webhook-based** channels, also implement `validateSafety()` to reject unexpected values for method, headers, queryParameters, and webhookSecret (standalone channels do not need this).
  - `prepare()`: resolve file path via `context.filePath()`, register with `context.registerAlertChannel()`.
  - `gencode()`: look up alert channel, add imports, emit `new {Name}AlertChannel(...)` expression using `file.section(decl(...))` pattern. Call `buildAlertChannelProps()` from `./alert-channel-codegen.js`.

## Phase 3: Registry (modify existing files)

- [ ] `src/constructs/index.ts` — Add export: `export * from './{name}-alert-channel.js'`

- [ ] **Webhook-based** — `src/constructs/webhook-alert-channel-codegen.ts`:
  1. Add `'WEBHOOK_{UPPER_NAME}'` to `WebhookType` union
  2. Import `{Name}AlertChannelCodegen`
  3. Add property and initialize in constructor
  4. Add entry to `codegensByWebhookType` map

- [ ] **Standalone** — `src/constructs/alert-channel-codegen.ts`:
  1. Add `'{UPPER_NAME}'` to `AlertChannelType` union
  2. Import `{Name}AlertChannelCodegen`
  3. Add property and initialize in constructor
  4. Add entry to `codegensByType` map

## Phase 4: Tests (new file)

- [ ] `src/constructs/__tests__/{name}-alert-channel.spec.ts` — Unit tests covering: construct instantiation, `synthesize()` output structure, property mapping, and `describe()`. Follow existing alert channel tests as template.

## Phase 5: Build and Verify

- [ ] `pnpm --filter checkly run prepare` — Rebuild.
- [ ] `pnpm --filter checkly test` — Run unit tests.
- [ ] `pnpm lint:fix` — Fix formatting (run from repo root).

## Naming Conventions

| Concept | Pattern | Example (Telegram) |
|---------|---------|-------------------|
| File name | `{name}-alert-channel.ts` | `telegram-alert-channel.ts` |
| Class name | `{Name}AlertChannel` | `TelegramAlertChannel` |
| Props interface | `{Name}AlertChannelProps` | `TelegramAlertChannelProps` |
| Webhook type | `WEBHOOK_{UPPER_NAME}` | `WEBHOOK_TELEGRAM` |
| Codegen class | `{Name}AlertChannelCodegen` | `TelegramAlertChannelCodegen` |
