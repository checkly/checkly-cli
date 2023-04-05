const config = {
  projectName: 'Deploy Project',
  logicalId: process.env.PROJECT_LOGICAL_ID,
  repoUrl: 'https://github.com/checkly/checkly-cli',
  checks: {
    checkMatch: '**/*.check.{js,mjs,ts}',
  },
}
export default config
