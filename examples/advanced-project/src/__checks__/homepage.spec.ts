// @ts-ignore
import { test, expect } from '@playwright/test'
import { defaults } from '../defaults'

test('Checkly Homepage', async ({ page }) => {
  await page.setViewportSize(defaults.playwright.viewportSize)
  const response = await page.goto(defaults.pageUrl)

  expect(response.status()).toBeLessThan(400)
  await expect(page).toHaveTitle(/Build and Run Synthetics That Scale/)
  await page.screenshot({ path: 'homepage.jpg' })
})
