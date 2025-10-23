const { test, expect } = require('@playwright/test')

// This check tests the add to cart functionality, a critical flow for e-commerce sites

test('Add to cart', async ({ page }) => {
  // The baseURL can be set in the playwrightConfig of your Checkly config
  await page.goto('/')

  // Navigate to a book category
  await page.locator('a', { hasText: 'Horror' }).click()

  // Add first book to cart
  await page.locator('.preview').first().click()
  await page.getByRole('button', { name: 'Add to cart' }).click()

  // Redirected to cart preview, verify item is added
  await expect(page.getByText('Your Shopping Cart')).toBeVisible()

  // Verify cart page and item is present
  const cartItems = await page.getByRole('listitem')
  await expect(cartItems).toHaveCount(1)

  // Verify cart total is displayed
  await expect(page.getByText('Total')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Checkout' })).toBeVisible()
})
