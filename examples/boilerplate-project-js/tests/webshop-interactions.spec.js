const { test, expect } = require('@playwright/test')

// This test is part of a Playwright Check Suite, configured in playwright.config.js

// This test validates the homepage with interactive navigation and user flows
test.describe('Homepage navigation and interactions', () => {
  test.beforeEach(async ({ page }) => {
    // The baseURL is configured in playwright.config.js
    await page.goto('/')
  })

  test('Homepage loads with special offer banner', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'SPECIAL OFFER: 20% OFF BOOKS' })).toBeVisible()
  })

  test('Sidebar navigation works', async ({ page }) => {
    await page.locator('a', { hasText: 'Horror' }).click()
    await expect(page.getByText('The Sitting')).toBeVisible()
  })

  test('Search bar is interactive', async ({ page }) => {
    // Fill in search bar
    await page.getByRole('textbox').fill('Laughterhouse-Five')
    
    // Wait for search results to appear
    await expect(page.getByText('Truk Tugennov')).toBeVisible()
  })
})
