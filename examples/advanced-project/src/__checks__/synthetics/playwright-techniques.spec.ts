import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// In this series of checks, we'll demonstrate some more advanced techniques
// for testing your web page with Playwright. None of the examples here are
// specific to Playwright running on Checkly.

test('Book details with request interception', async ({ page }) => {
  // Here we want to check the content of a book's details, but the stock
  // value is dynamic. How can we stabilize it? With request interception
  // read more here: https://www.checklyhq.com/learn/playwright/intercept-requests/
  await page.route('*/**/api/books/23', async route => { //wait for requests that match this pattern.
    const response = await route.fetch();
    const json = await response.json(); // Capture the response JSON
    json.stock = "0" // modify the JSON to have a stable value
    await route.fulfill({ response, json }); // return the modified JSON
  });
  await page.goto('https://danube-web.shop/books/23');
  //Removed for brevity: checks of the book's title, genre, etc.
  await expect(page.getByRole('button', { name: 'Add to cart' })).toBeVisible();
  await expect(page.locator('#app-content')).toContainText("Left in stock: 0");
});

// The next test is a visual regression test that will compare an existing
// screenshot to a current screenshot. As there's no screenshot stored for
// this test yet, this check is commented out. To use it, uncomment the test
// and run `npx checkly test --update-snapshots` to store a "known good" screenshot.

/* test('Visual Regression Testing', async ({ page }) => {
   await page.goto('https://danube-web.shop/')
   await expect(page).toHaveScreenshot({ maxDiffPixelRatio: 0.2 })
   await expect(page).toHaveScreenshot({ maxDiffPixels: 1000 })
   await expect(page).toHaveScreenshot({ threshold: 0.2 })
}); */

test('Accessibility issues', async ({ page }) => {
  // this check uses the Axe library to perform accessibility testing on our site.
  // axe-core is part of the Checkly runtime as of the 2024.02 version.
  // read about it here: https://www.checklyhq.com/blog/integrating-accessibility-checks-in-playwright-tes/
  await page.goto('https://danube-web.shop/');
  const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
  expect(accessibilityScanResults.violations).toHaveLength(8); // ideally we'd find zero issues
});

