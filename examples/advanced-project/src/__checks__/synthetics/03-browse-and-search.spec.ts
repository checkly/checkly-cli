import { test, expect } from '@playwright/test'

// Source code for a browser check using Playwright Test. Find more Playwright information at 
// https://www.checklyhq.com/learn/playwright/ 

// This environment variable is set in the group configuration in /utils/website-groups.check.ts
const searchString: string = process.env.authorName || "Herman Moulson"

test('webshop homepage', async ({ page }) => {
  await page.goto('http://danube-web.shop/');
  await expect(page.getByRole('heading', { name: 'SPECIAL OFFER: 20% OFF BOOKS' })).toBeVisible();
  await page.locator('a').filter({ hasText: 'Fantasy' }).click();
  await expect(page.getByText('The Pickled Lynx')).toBeVisible();
  await page.getByRole('textbox').click();
  await page.getByRole('textbox').fill(searchString);
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByText('Haben oder haben')).toBeVisible();
})
