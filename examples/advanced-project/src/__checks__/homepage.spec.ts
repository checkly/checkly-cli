import { test, expect } from '@playwright/test'
import { defaults } from '../defaults'

// You can override the default Playwright test timeout of 30s
// test.setTimeout(60_000)

test('Checkly Homepage', async ({ page }) => {
  await page.setViewportSize(defaults.playwright.viewportSize)
  const response = await page.goto(defaults.pageUrl)

  expect(response?.status()).toBeLessThan(400)
  await expect(page).toHaveTitle(/Danube WebShop/)
  await page.screenshot({ path: 'homepage.jpg' })
})
