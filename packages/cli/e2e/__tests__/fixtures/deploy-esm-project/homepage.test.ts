// @ts-ignore
import { test, expect } from '@playwright/test'
import { defaults } from './defaults.mjs'

test('Danube Homepage', async ({ page }: { page: any }) => {
  await page.setViewportSize(defaults.playwright.viewportSize)
  const response = await page.goto(defaults.pageUrl)

  expect(response.status()).toBeLessThan(400)
  await expect(page).toHaveTitle(/Danube WebShop/)
  await page.screenshot({ path: 'homepage.jpg' })
})
