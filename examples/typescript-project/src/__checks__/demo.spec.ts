import { test, expect } from '@playwright/test'
import defaults from './defaults'

test('Demo', async ({ page }) => {
  await page.goto(defaults.pageUrl)
  await page.screenshot({ path: 'homepage.jpg' })
})