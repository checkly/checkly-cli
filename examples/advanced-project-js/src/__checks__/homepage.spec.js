const { defaults } = require('../defaults');
const { test, expect } = require('@playwright/test');

// You can override the default Playwright test timeout of 30s
// test.setTimeout(60000);

test('Checkly Homepage', async ({ page }) => {
  await page.setViewportSize(defaults.playwright.viewportSize);
  const response = await page.goto(defaults.pageUrl);

  expect(response?.status()).toBeLessThan(400);
  await expect(page).toHaveTitle(/Danube WebShop/);
  await page.screenshot({ path: 'homepage.jpg' });
});
