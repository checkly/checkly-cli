# Agentic Checks

- Import the `AgenticCheck` construct from `checkly/constructs`.
- Agentic checks are AI-powered: instead of writing code, you describe what the check should do in natural language with the `prompt` property. The agent decides how to satisfy the prompt at runtime.
- Write prompts as concrete imperative steps, not vague goals. Tell the agent which URL to navigate to and what specific signals confirm success — for example, "Navigate to https://example.com/pricing and verify that at least three plan tiers are displayed", not "Check that pricing works".
- Keep prompts under 10000 characters. The construct will fail validation otherwise.
- **Frequency is restricted.** Only `30`, `60`, `120`, `180`, `360`, `720`, or `1440` minutes are accepted (matching `Frequency.EVERY_30M`, `EVERY_1H`, `EVERY_2H`, `EVERY_3H`, `EVERY_6H`, `EVERY_12H`, `EVERY_24H`). Anything else fails validation.
- **Locations are not configurable.** Agentic checks currently run from a single fixed location. The construct hardcodes it — do not pass `locations` or `privateLocations`.
- **Several common check fields are intentionally omitted** from `AgenticCheckProps`: `runParallel`, `retryStrategy`, `shouldFail`, `doubleCheck`, `triggerIncident`, and `groupId`. The platform does not yet honor these for agentic checks. Setting them in the construct is a TypeScript error.
- **Important:** The target URL must be publicly accessible. Checks run on Checkly's cloud infrastructure, not locally. If the user is developing against localhost, suggest a tunneling tool (ngrok, cloudflare tunnel) or a preview/staging deployment.
- **Plan-gated:** Agentic checks require the `AGENTIC_CHECKS` entitlement on the account. Run `npx checkly skills manage` to check entitlements before using.

## `agentRuntime` — security boundary for skills and env vars

`agentRuntime` is the explicit allowlist of resources the agent may use at execution time. Anything not declared in `agentRuntime` is **unavailable** to the agent. Treat it as a security boundary: the smaller the runtime surface, the smaller the blast radius of any prompt injection.

```typescript
agentRuntime: {
  // Additional skills to load on top of the runner's defaults (the
  // `playwright-cli` skill is preloaded automatically — you don't need
  // to declare it). Each entry is passed verbatim to `npx skills add`
  // on the runner, so any third-party skill published to https://skills.sh
  // works — not just Checkly's own. Supported identifier forms:
  //   - full URL form:   'https://skills.sh/microsoft/playwright-cli/playwright-cli'
  //   - owner/repo form: 'addyosmani/web-quality-skills'
  //   - plain name:      'cost-optimization'
  skills: ['addyosmani/web-quality-skills'],

  // Environment variables the agent is allowed to read at runtime.
  // Anything not listed here is hidden from the agent process — even
  // if it's defined at the project or check level.
  environmentVariables: [
    // Bare string form: variable name only.
    'ENVIRONMENT_URL',
    // Object form: pair the variable with a description so the agent
    // can decide when to read it. Descriptions are passed to the model
    // and are truncated to 200 characters.
    { name: 'TEST_USER_EMAIL', description: 'Login email for the test account' },
  ],
},
```

- Only declare env vars the agent **needs**. Adding a variable to `environmentVariables` exposes it to the model and to anything the model invokes via skills.
- Descriptions are not just documentation — they steer the model's decisions. Use them to disambiguate variables that have non-obvious names.
- The runner installs each skill via `npx skills add` at the start of every check run. The CLI does not validate the skill identifier at deploy time, so a typo will not surface until the first run.
- The `playwright-cli` skill is preloaded for every agentic check. Only declare additional skills here.

## Assertion rules

The agent generates its own assertion rules on the first successful run, and the platform persists them server-side. **The CLI construct does not expose assertion rules** — do not try to set them. They survive across deploys: importing an existing agentic check via `checkly import` will not surface them in the generated TypeScript, and a subsequent deploy of that file will not erase them on the backend.

<!-- EXAMPLE: AGENTIC_CHECK -->
