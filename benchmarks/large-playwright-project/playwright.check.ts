import { CheckGroupV2, Frequency, PlaywrightCheck } from 'checkly/constructs'

/*
 * Generates a large number of PlaywrightChecks that all share one
 * playwright.config.ts and the same ./tests + ./src import graph. This is a
 * stress fixture for project parsing and bundling: the shared dependency graph
 * has to be discovered and resolved for the project, while the number of checks
 * referencing it is varied independently.
 *
 * Tune the scale with env vars:
 *   CHECK_COUNT  number of logical checks (default 200)
 *   LOCATIONS    comma-separated locations (default 3 regions)
 *
 * Total PlaywrightCheck constructs = CHECK_COUNT * LOCATIONS. Creating one
 * construct per (check, location) — rather than a single check with a
 * locations array — maximises the number of constructs the bundler processes.
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
