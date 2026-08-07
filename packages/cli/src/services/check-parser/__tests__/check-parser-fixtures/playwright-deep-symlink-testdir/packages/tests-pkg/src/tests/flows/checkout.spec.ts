import {test, chromium} from '@playwright/test';

test('Google test', async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  // check start page is displayed
  await page.goto('https://google.com');
});
