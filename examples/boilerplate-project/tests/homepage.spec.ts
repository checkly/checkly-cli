import { expect, test } from '@playwright/test'

test('Visit Checkly home page', async ({ page }) => {
  await page.goto('/')

  await expect(page).toHaveTitle(/Build and Run Synthetics That Scale/)
  await expect(page.getByText(/Welcome to Checkly/)).toBeVisible()
})
