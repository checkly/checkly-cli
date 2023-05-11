// @ts-ignore
import { test, expect } from '@playwright/test'
import { defaults } from '../../../defaults'

/**
 * This spec file will be picked up and turned into a Browser Check, using the defaults from the checkly.config.ts file
 * at the root of this example.
 */

// You can override the default Playwright test timeout of 30s
// test.setTimeout(60_000)

test.describe('Top Sellers', () => {
  test('Test Novel Top Sellers', async ({ page }) => {
    await page.setViewportSize(defaults.playwright.viewportSize)
    const response = await page.goto(`${defaults.pageUrl}/category?string=novel`)

    expect(response?.status()).toBeLessThan(400)
    await expect(page.getByText('Top sellers')).toBeVisible()
    await page.screenshot({ path: 'top_sellers_novel.jpg' })
  })

  test('Test Sci-Fi Top Sellers', async ({ page }) => {
    await page.setViewportSize(defaults.playwright.viewportSize)
    const response = await page.goto(`${defaults.pageUrl}/category?string=scifi`)

    expect(response?.status()).toBeLessThan(400)
    await expect(page.getByText('Top sellers')).toBeVisible()
    await page.screenshot({ path: 'top_sellers_scifi.jpg' })
  })
})
