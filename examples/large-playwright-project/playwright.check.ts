import { CheckGroupV2, Frequency, PlaywrightCheck } from 'checkly/constructs'

/*
 * Emulates the reported customer scenario: hundreds of PlaywrightChecks all
 * generated from one shared source tree, each duplicated across several
 * locations. Every check points at the SAME playwright.config.ts and the same
 * ./tests + ./src import graph, so before the bundling fixes each construct
 * re-loaded the config, re-resolved the Playwright version, and re-parsed and
 * re-resolved the entire shared dependency graph — concurrently — which is
 * what exhausted the heap.
 *
 * Tune the scale with env vars:
 *   CHECK_COUNT  number of logical checks (default 200)
 *   LOCATIONS    comma-separated locations (default 3 regions)
 *
 * Total PlaywrightCheck constructs = CHECK_COUNT * LOCATIONS. Creating one
 * construct per (check, location) — rather than a single check with a
 * locations array — maximises the width of the Project.bundle() fan-out, which
 * is what the concurrency cap and the shared caches are there to tame.
 */
const CHECK_COUNT = Number(process.env.CHECK_COUNT ?? 200)
const LOCATIONS = (process.env.LOCATIONS ?? 'us-east-1,eu-west-1,ap-southeast-1')
  .split(',')
  .map(location => location.trim())
  .filter(Boolean)

const group = new CheckGroupV2('large-pw-group', {
  name: 'Large Playwright Group',
})

for (let i = 0; i < CHECK_COUNT; i++) {
  for (const location of LOCATIONS) {
    // eslint-disable-next-line no-new
    new PlaywrightCheck(`pw-check-${i}-${location}`, {
      name: `Playwright Check ${i} (${location})`,
      group,
      playwrightConfigPath: './playwright.config.ts',
      locations: [location],
      frequency: Frequency.EVERY_10M,
    })
  }
}
