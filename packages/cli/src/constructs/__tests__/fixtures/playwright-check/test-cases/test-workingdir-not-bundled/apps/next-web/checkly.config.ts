import { defineConfig } from 'checkly'

// Reproduces a monorepo layout that fails at runtime with "internal error
// (attempt 2)".
//
// The Checkly config lives in apps/next-web, so the CLI derives
// workingDir="apps/next-web". The Playwright project (config + tests) lives two
// levels up in packages/consumer and imports nothing from apps/next-web, so the
// dependency-graph file collector never reaches apps/next-web. The result is a
// bundle whose workingDir is absent — the runner cannot `cd` into it.
const config = defineConfig({
  projectName: 'workingdir-repro',
  logicalId: 'workingdir-repro',
  checks: {
    playwrightConfigPath: '../../packages/consumer/playwright.config.ts',
    playwrightChecks: [
      {
        logicalId: 'pw-suite',
        name: 'Playwright Check Suite',
      },
    ],
  },
})

export default config
