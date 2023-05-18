// @ts-ignore
import { test, expect } from '@playwright/test'
import { defaults } from '../defaults'
import { ExternalFirstPage } from '../pages/external.first.page.js'
import { ExternalSecondPage } from '../pages/external.second.page'

test('Danube Homepage', async ({ page }: { page: any }) => {
  expect(ExternalFirstPage.title).toBe('External First Page')
  expect(ExternalSecondPage.title).toBe('External Second Page')
  await page.setViewportSize(defaults.playwright.viewportSize)
  const response = await page.goto(defaults.pageUrl)

  expect(response.status()).toBeLessThan(400)
  await expect(page).toHaveTitle(/Danube WebShop/)
  await page.screenshot({ path: 'homepage.jpg' })
})
