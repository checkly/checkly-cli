import { defineConfig, devices } from '@playwright/test'

// One shared Playwright config for every generated check. Because all checks
// point at this single config + test tree, the bundling/parsing work is
// identical across them — which is exactly what used to be repeated per check.
export default defineConfig({
  testDir: './tests',
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
})
