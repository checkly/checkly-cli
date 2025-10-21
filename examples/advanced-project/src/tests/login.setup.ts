import { test as setup } from '@playwright/test'

// This check logs in as a user would, by clicking and entering text on your web page.

// See Checkly's documentation on secrets and variables: https://www.checklyhq.com/docs/browser-checks/variables/
const password: string = process.env.WEB_SHOP_PASSWORD || 'defaultPwd'

const AUTH_FILE = '.auth/user.json'

setup('Log into web shop', async ({ page }) => {
  // The base URL is set in your Playwright config
  await page.goto('/')

  await page.getByRole('button', { name: 'Log in' }).click()

  await page.getByPlaceholder('Email').click()
  await page.getByPlaceholder('Email').fill('testUser@email.com')

  await page.getByPlaceholder('Password').click()
  await page.getByPlaceholder('Password').fill(password)
  
  // await page.getByRole('button', { name: 'Sign in' }).click()
  
  // Use storage state to write the browser state to disk
  // More info: https://playwright.dev/docs/api/class-browsercontext#browser-context-storage-state    
  await page.context().storageState({ path: AUTH_FILE })
  console.log(`Wrote storage state to ${AUTH_FILE}`)

  // Once login is successful to your site, add assertions to check the response
  // await expect(page.getByText('Welcome back')).toBeVisible()
})
