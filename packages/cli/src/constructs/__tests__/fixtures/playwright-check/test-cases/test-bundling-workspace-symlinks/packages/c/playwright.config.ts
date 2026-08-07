import { defineConfig } from '@playwright/test'

export default defineConfig({
  // A deep path through the @scope/x workspace link, which the test creates at
  // run time as node_modules/@scope/x -> ../../../x. The tests themselves live
  // in the linked workspace package, not in this package.
  testDir: './node_modules/@scope/x/src/tests/flows',
  timeout: 30000,
})
