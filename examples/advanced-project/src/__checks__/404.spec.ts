import { test, expect } from '@playwright/test'
import { defaults } from '../defaults'

// You can override the default Playwright test timeout of 30s
// test.setTimeout(60_000);

test('Checkly 404 page', async ({ page }) => {
  await page.setViewportSize(defaults.playwright.viewportSize)
  const response = await page.goto(`${defaults.pageUrl}/does-not-exist`)

  expect(response?.status()).toBe(404)
  expect(await page.title()).toEqual('404 Page not found | Checkly')
  expect(await page.locator('.main h1').innerText()).toContain('404')
  expect(await page.locator('.main h3').innerText()).toContain('Whoops, that page does not exist!')
  await page.screenshot({ path: '404.jpg' })
})
