import * as fs from 'fs'
import * as path from 'path'
import { isValidUrl } from '../utils/directory.js'
import { askCreateInitialBrowserCheck, askUserWebsite } from '../utils/prompts.js'

// Default Playwright-based Browser Check
const defaultBrowserCheck = `import { test, expect } from '@playwright/test'

// You can override the default Playwright test timeout of 30s
// test.setTimeout(60_000);

test('Custom Browser Check', async ({ page }) => {
  const response = await page.goto('URL_TO_CHECK')
  expect(response?.status()).toBeLessThan(400)
  await page.screenshot({ path: 'screenshot.jpg' })
})`

export async function createCustomBrowserCheck (
  { projectDirectory, onCancel }: { projectDirectory: string, onCancel: () => void },
) {
  const { createInitialBrowserCheck } = await askCreateInitialBrowserCheck(onCancel)

  if (createInitialBrowserCheck) {
    const { userWebsite } = await askUserWebsite(onCancel)

    if (isValidUrl(userWebsite)) {
      fs.writeFileSync(path.join(projectDirectory, './__checks__/custom.spec.ts'),
        defaultBrowserCheck.replace(/URL_TO_CHECK/i, new URL(userWebsite).toString()))
    } else {
      process.stdout.write('Custom check wasn\'t created: the specified URL isn\'t valid.\n')
    }
  }
}
