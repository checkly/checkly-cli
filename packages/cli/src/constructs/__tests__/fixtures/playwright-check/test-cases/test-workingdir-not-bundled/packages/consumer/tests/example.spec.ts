import { test, expect } from '@playwright/test'

// Imports nothing from apps/next-web — so the dependency-graph file collector
// never reaches the workingDir.
test('basic test', async ({ page }) => {
  await page.goto('https://playwright.dev/')
  expect(await page.title()).toContain('Playwright')
})
