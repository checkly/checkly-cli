import { defineConfig } from 'checkly'

// Loads only b.check.ts, so the shared modules are first evaluated during
// a different importer's load than with the default config.
export default defineConfig({
  projectName: 'shared constructs project',
  logicalId: 'shared-constructs-project',
  repoUrl: 'https://github.com/checkly/checkly-cli',
  checks: {
    checkMatch: 'src/b.check.ts',
    locations: ['eu-west-1'],
  },
})
