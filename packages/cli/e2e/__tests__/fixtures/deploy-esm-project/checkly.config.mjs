const config = {
  projectName: 'Deploy Project',
  logicalId: process.env.PROJECT_LOGICAL_ID,
  repoUrl: 'https://github.com/checkly/checkly-cli',
  checks: {
    browserChecks: {
      // using .test.ts suffix (no .spec.ts) to avoid '@playwright/test not found error' when Jest transpile the spec.ts
      testMatch: '**/*.test.{js,mjs,ts}',
    },
    checkMatch: '**/*.check.{js,mjs,ts}',
  },
}
export default config
