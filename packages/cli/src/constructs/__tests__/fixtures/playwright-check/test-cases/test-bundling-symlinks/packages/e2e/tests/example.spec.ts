import { test, expect } from '@playwright/test'

import { login } from '../helpers/login.js'

test('basic test', async ({ page }) => {
  expect(login()).toBe('logged-in')
  await page.goto('https://playwright.dev/')
})
