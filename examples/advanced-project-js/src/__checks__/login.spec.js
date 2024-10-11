const { test } = require('@playwright/test');

test('login', async ({ page }) => {
  // navigate to our target web page
  await page.goto('');

  // click on the login button and go through the login procedure
  await page.click('#login');
  await page.type('#n-email', 'user@email.com');
  await page.type('#n-password2', 'supersecure1');
  await page.click('#goto-signin-btn');

  // wait until the login confirmation message is shown
  await page.waitForSelector('#login-message', { visible: true });
});
