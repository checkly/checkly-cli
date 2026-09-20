import { defineConfig } from 'checkly'

// Used by src/services/__tests__/project-parser-source-file.spec.ts (parse
// output) and by e2e/__tests__/test.spec.ts (`checkly test --list`); a
// change here shows up in both.
export default defineConfig({
  projectName: 'shared constructs project',
  logicalId: 'shared-constructs-project',
  repoUrl: 'https://github.com/checkly/checkly-cli',
  checks: {
    checkMatch: 'src/**/*.check.ts',
    locations: ['eu-west-1'],
  },
})
