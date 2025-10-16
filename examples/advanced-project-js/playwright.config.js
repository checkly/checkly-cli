const { defineConfig, devices } = require('@playwright/test');
const path = require('path');

const AUTH_FILE = '.auth/user.json';

const config = defineConfig({
  timeout: 30000,
  use: {
    baseURL: 'https://checklyhq.com',
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    {
      name: 'login-setup',
      testMatch: /.*\.setup.js/,
      use: {
        ...devices['Desktop Chrome'],
      },
    },
    {
      name: 'Firefox',
      testDir: './src/tests/',
      use: {
        ...devices['Desktop Firefox'],
        storageState: path.resolve(__dirname, AUTH_FILE),
      },
      dependencies: ["login-setup"],
    },
    {
      name: 'Chromium',
      testDir: './src/tests/',
      use: {
        ...devices['Desktop Chrome'],
        storageState: path.resolve(__dirname, AUTH_FILE),
        // Optionally add Checkly user-agent
        userAgent: devices['Desktop Chrome'].userAgent + ' (Checkly, https://www.checklyhq.com)',
      },
      dependencies: ['login-setup'],
    },
  ]
});

module.exports = config;
