const { defineConfig, devices } = require('@playwright/test')

module.exports = defineConfig({
  timeout: 30000,
    // Look for test files in the 'tests' directory, relative to this configuration file.
  testDir: './tests',

  // Run all tests in parallel.
  fullyParallel: true,

  // Fail the build on CI if you accidentally left test.only in the source code.
  forbidOnly: !!process.env.CI,

  // Retry tests on CI only.
  retries: process.env.CI ? 2 : 0,

  // Opt out of parallel tests on CI.
  workers: process.env.CI ? 1 : undefined,

  // Reporter to use
  reporter: 'html',

  use: {
    // Base URL to use in actions like `await page.goto('/')`.
    baseURL: 'https://www.danube-web.shop',
    viewport: { width: 1280, height: 720 },
    // Always collect trace
    trace: 'on',
  },
  
  // Configure projects for major browsers.
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
  ],

})