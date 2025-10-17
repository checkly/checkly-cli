import { expect, test } from '@playwright/test'

test('Visit Checkly docs', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('link', { name: '/docs' })).toBeVisible()
  await page.getByRole('link', { name: '/docs' }).click()
  
  await expect(page).toHaveTitle(/Checkly Documentation/)

  // interact with the page and add more assertions
})
