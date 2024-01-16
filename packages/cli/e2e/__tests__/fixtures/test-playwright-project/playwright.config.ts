import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'tests',
  timeout: 1234,
  use: {
    baseURL: 'http://127.0.0.1:3000',
    extraHTTPHeaders: {
      foo: 'bar',
    },
  },
  expect: {
    toMatchSnapshot: {
      maxDiffPixelRatio: 1,
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
