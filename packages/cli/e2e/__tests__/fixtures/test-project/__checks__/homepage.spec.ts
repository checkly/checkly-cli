// @ts-ignore
import { test, expect } from '@playwright/test'

test('Checkly Homepage', async ({ page }) => {
  const response = await page.goto('https://checklyhq.com')
  expect(response.status()).toBeLessThan(400)
  await expect(page).toHaveTitle(/Build and Run Synthetics That Scale/)
  await page.screenshot({ path: 'homepage.jpg' })
})
