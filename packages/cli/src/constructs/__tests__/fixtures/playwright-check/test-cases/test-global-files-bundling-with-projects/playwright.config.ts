import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  globalSetup: './setup.ts',
  globalTeardown: './teardown.ts',
  tsconfig: './tsconfig.playwright.json',
  testDir: './non-existent',
  projects: [{
    name: "chromium",
    use: { ...devices["Desktop Chrome"] },
  }],
})
