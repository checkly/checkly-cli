import { defineConfig } from '@playwright/test'

export default defineConfig({
  // linked-tests is created as a symlink to ./shared/tests at test time. Both
  // references run through the link, so the extracted bundle must contain the
  // link for these spellings to resolve.
  testDir: './linked-tests',
  globalSetup: './linked-tests/setup.ts',
  timeout: 30000,
})
