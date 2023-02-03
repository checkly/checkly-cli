// @ts-ignore
import { test, expect } from '@playwright/test'
import { defaults } from '../../../defaults'

/**
 * This spec file will be picked up and turned into a Browser check, using the defaults from the checkly.config.js file
 * at the root of this example.
 */

test.describe('Docs', () => {
  test('Docs Landing Page', async ({ page }) => {
    await page.setViewportSize(defaults.playwright.viewportSize)
    const response = await page.goto(`${defaults.pageUrl}/docs`)

    expect(response.status()).toBeLessThan(400)
    await expect(page).toHaveTitle(/documentation/)
    await page.screenshot({ path: 'docs_landing.jpg' })
  })

  test('Docs Search Page', async ({ page }) => {
    await page.setViewportSize(defaults.playwright.viewportSize)
    const response = await page.goto(`${defaults.pageUrl}/docs`)

    expect(response.status()).toBeLessThan(400)
    await expect(page).toHaveTitle(/documentation/)

    await page.getByPlaceholder('Press / to search').fill('browser')
    await expect(page.locator('.ds-dataset-1')).toBeVisible()

    await page.screenshot({ path: 'docs_search.jpg' })
  })
})
