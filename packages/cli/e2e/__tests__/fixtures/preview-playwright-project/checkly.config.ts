import { defineConfig } from 'checkly'

// A project with one Playwright check suite, for the deploy preview's
// rendering of a suite as a construct. No lockfile is committed: the test
// sandbox copies its template's lockfile in, which the suite's validation
// requires.
export default defineConfig({
  projectName: 'Preview Playwright Project',
  logicalId: process.env.PROJECT_LOGICAL_ID!,
  repoUrl: 'https://github.com/checkly/checkly-cli',
  checks: {
    checkMatch: '**/*.check.ts',
  },
  cli: {
    runLocation: 'us-east-1',
  },
})
