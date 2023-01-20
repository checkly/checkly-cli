const { test, expect } = require('@playwright/test')
const { defaults } = require('../../defaults')

test('Checkly Homepage', async ({ page }) => {
  await page.setViewportSize(defaults.playwright.viewportSize)
  const response = await page.goto(defaults.pageUrl)

  expect(response.status()).toBeLessThan(400)
  await expect(page).toHaveTitle(/Monitoring/)
  await page.screenshot({ path: 'homepage.jpg' })
})
