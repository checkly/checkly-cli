const { test, expect } = require('@playwright/test')

// This test is being used as a Browser check
// See browserCheck.testMatch in your checkly.config.js to configure

test('Visit webshop homepage', async ({ page }) => {
  // The baseURL for Browser checks can be set in the playwrightConfig of your checkly.config.js
  const response = await page.goto('/')
  expect(response?.status()).toBeLessThan(400)
  await expect(page).toHaveTitle(/Danube WebShop/)
  await page.screenshot({ path: 'homepage.jpg' })
})
