import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  timeout: 1234,
  projects: [
    {
      name: 'test-example',
      testDir: './test',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'test-project',
      testDir: './test-project',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
