/* eslint-disable no-console */
import { expect, test } from '@playwright/test'

test.use({ actionTimeout: 10000 })

test('Welcome Snapshot Test', async ({ page }) => {
  await page.goto('https://welcome.checklyhq.com')
  await expect(page).toHaveScreenshot({ maxDiffPixels: 10000 })
  console.log(process.env.SECRET_ENV)
})
