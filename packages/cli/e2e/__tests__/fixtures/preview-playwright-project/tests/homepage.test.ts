import { expect, test } from '@playwright/test'

test('homepage loads', async ({ page }) => {
  await page.goto('https://www.checklyhq.com')
  await expect(page).toHaveTitle(/Checkly/)
})
