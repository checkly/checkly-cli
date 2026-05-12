# Agentic Checks

- Import the `AgenticCheck` construct from `checkly/constructs`.
- Agentic checks are AI-powered: instead of writing code, you describe what the check should do in natural language with the `prompt` property. The agent decides how to satisfy the prompt at runtime.
- Write prompts as concrete imperative steps, not vague goals. Tell the agent which URL to navigate to and what specific signals confirm success — for example, "Navigate to https://example.com/pricing and verify that at least three plan tiers are displayed", not "Check that pricing works".
- Keep prompts under 10000 characters. The construct will fail validation otherwise.
- **Frequency is entitlement-gated by the backend.** You can configure the same `frequency` values as other checks, including `Frequency.EVERY_5M` / `5`. The backend enforces the fastest cadence available to the account.
- **Locations are entitlement-gated by the backend.** You can pass `locations` just like other public checks. The backend enforces the allowed number of regions for the account. `privateLocations` are not supported.
- **Several common check fields are intentionally omitted** from `AgenticCheckProps`: `runParallel`, `retryStrategy`, `shouldFail`, `doubleCheck`, `triggerIncident`, and `groupId`. The platform does not yet honor these for agentic checks. Setting them in the construct is a TypeScript error.
- **Important:** The target URL must be publicly accessible. Checks run on Checkly's cloud infrastructure, not locally. If the user is developing against localhost, suggest a tunneling tool (ngrok, cloudflare tunnel) or a preview/staging deployment.
- **Plan-gated:** Agentic checks require the `AGENTIC_CHECKS` entitlement on the account. Run `npx checkly skills manage` to check entitlements before using.

## `agentRuntime` skills

`agentRuntime` is used to add skills the agent may use at execution time.

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
},
```

- Reference Checkly environment variables directly in the prompt with double brackets, for example `{{ENVIRONMENT_URL}}`.
- The runner installs each skill via `npx skills add` at the start of every check run. The CLI does not validate the skill identifier at deploy time, so a typo will not surface until the first run.
- The `playwright-cli` skill is preloaded for every agentic check. Only declare additional skills here.

## Assertion rules

The agent generates its own assertion rules on the first successful run, and the platform persists them server-side. **The CLI construct does not expose assertion rules** — do not try to set them. They survive across deploys: importing an existing agentic check via `checkly import` will not surface them in the generated TypeScript, and a subsequent deploy of that file will not erase them on the backend.

<!-- EXAMPLE: AGENTIC_CHECK -->
