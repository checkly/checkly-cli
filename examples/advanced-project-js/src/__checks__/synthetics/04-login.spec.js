const { test } = require('@playwright/test')

// This check logs in as a user would, by clicking and entering text on your web page.

test('login', async ({ page }) => {
  // See Checkly's documentation on secrets and variables: https://www.checklyhq.com/docs/browser-checks/variables/
  const password = process.env.WEB_SHOP_PASSWORD || 'defaultPwd';
  await page.goto('http://danube-web.shop/');
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.getByRole('textbox', { name: 'Email' }).click();
  await page.getByRole('textbox', { name: 'Email' }).fill('testUser@email.com');
  await page.getByRole('textbox', { name: 'Password' }).click();
  await page.getByRole('textbox', { name: 'Password' }).fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  // Once login is successful to your site, add assertions to check the response
})
