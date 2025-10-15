import { expect, test } from '@playwright/test'

test('Visit Checkly docs', async ({ page }) => {
  await page.goto('/docs')

  await expect(page).toHaveTitle(/Checkly Documentation/)

  // More test code ...
})
