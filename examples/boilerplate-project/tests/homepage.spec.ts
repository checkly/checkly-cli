import { expect, test } from '@playwright/test'

test('Visit Checkly home page', async ({ page }) => {
  await page.goto('/')

  await expect(page).toHaveTitle(/Checkly/)
  
  // dismiss cookie banner if it appears
  await page.addLocatorHandler(page.getByRole('button', { name: 'Accept All' }), async () => {
    await page.getByRole('button', { name: 'Accept All' }).click()
    await expect(page.getByText('We value your privacy')).not.toBeVisible()
  })

  await expect(page.getByText(/Detect. Communicate. Resolve./i)).toBeVisible()
})
