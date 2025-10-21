import { defineConfig, devices } from '@playwright/test'

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(__dirname, '.env') })

export const AUTH_FILE = '.auth/user.json'

/**
 * See https://playwright.dev/docs/test-configuration.
 */

export default defineConfig({
  timeout: 30000,
  use: {
    baseURL: 'https://www.danube-web.shop',
    viewport: { width: 1280, height: 720 },
    trace: 'on',
  },
  projects: [
    {
      name: 'login-setup',
      testMatch: /.*\.setup.ts/,
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
      dependencies: ['login-setup'],
    },
    {
      name: 'Chromium',
      testDir: './src/tests/',
      use: {
        ...devices['Desktop Chrome'],
        storageState: path.resolve(__dirname, AUTH_FILE),
        // Optionally add Checkly user-agent
        userAgent: `${devices['Desktop Chrome'].userAgent} (Checkly, https://www.checklyhq.com)`,
      },
      dependencies: ['login-setup'],
    },
  ]
})
