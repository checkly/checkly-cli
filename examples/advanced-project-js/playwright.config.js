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
      use: { ...devices['Desktop Chrome'] },
    },
  ]
});

module.exports = config;
