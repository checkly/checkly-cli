/* eslint-disable no-console */
// Note: These must be relative imports above the checkly.config.ts location
import { waitForNewTab, waitForPageNavigation } from '../../common/__test-utils__/playwright'
import { test } from '@playwright/test'

test('login and and navigate to the provider shopfront', ({ page }) => {
  console.log('ok')
  page.setDefaultTimeout(10000)
  console.log(waitForNewTab, waitForPageNavigation)
})
