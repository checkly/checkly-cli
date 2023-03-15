const config = {
  projectName: 'Deploy Staging Project',
  logicalId: process.env.PROJECT_LOGICAL_ID,
  repoUrl: 'https://github.com/checkly/checkly-cli',
  checks: {
    browserChecks: {
      // using .test.ts suffix (no .spec.ts) to avoid '@playwright/test not found error' when Jest transpile the spec.ts
      testMatch: '**/*.test.ts',
    },
  },
}
export default config
