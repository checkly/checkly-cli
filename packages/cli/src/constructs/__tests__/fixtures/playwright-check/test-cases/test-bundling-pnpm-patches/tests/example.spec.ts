import { test, expect } from '@playwright/test'

test('basic test', async ({ page }) => {
  await page.goto('https://playwright.dev/')
  expect(await page.title()).toContain('Playwright')
})
