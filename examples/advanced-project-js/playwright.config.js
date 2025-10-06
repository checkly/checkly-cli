const { defineConfig, devices } = require('@playwright/test');

const config = defineConfig({
  timeout: 30000,
  use: {
    baseURL: 'https://www.danube-web.shop',
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    {
      testDir: './src/playwright/',
      name: 'Playwright tests',
      use: {
        ...devices['Desktop Chrome'],
        userAgent: `${devices['Desktop Chrome'].userAgent} (Checkly, https://www.checklyhq.com)`
      },
    },
  ]
});

module.exports = config;