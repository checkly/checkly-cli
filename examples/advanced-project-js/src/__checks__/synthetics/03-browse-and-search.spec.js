const { test, expect } = require('@playwright/test')

// Source code for a browser check using Playwright Test. Find more Playwright information at 
// https://www.checklyhq.com/learn/playwright/ 

// This environment variable is set in the group configuration in /utils/website-groups.check.ts
const searchString = process.env.AUTHOR_NAME || "Herman Moulson"

test('Browse and search for a book', async ({ page }) => {
  // The baseURL can be set in the playwrightConfig of your Checkly config
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'SPECIAL OFFER: 20% OFF BOOKS' })).toBeVisible()

  // Navigate to Fantasy category and verify a book is visible
  await page.locator('a', { hasText: 'Fantasy' }).click()
  await expect(page.getByText('The Pickled Lynx')).toBeVisible()

  // Use the search bar to search for an author and verify a book is visible
  await page.getByRole('textbox').fill(searchString)
  await page.getByRole('button', { name: 'Search' }).click()
  await expect(page.getByText('Haben oder haben')).toBeVisible()
})
