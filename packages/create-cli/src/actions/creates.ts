import * as fs from 'fs'
import * as path from 'path'
import shell from 'shelljs'
import prompts from 'prompts'
import { isValidUrl } from '../utils/directory'

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
  { onCancel }: { onCancel: () => void },
) {
  const createInitialBrowserCheckResponse = await prompts({
    type: 'confirm',
    name: 'value',
    message: 'Would you like to create a custom Playwright-based Browser Check to check a URL?',
    initial: true,
  },
  { onCancel },
  )

  if (createInitialBrowserCheckResponse.value) {
    const userWebsiteResponse = await prompts({
      type: 'text',
      name: 'url',
      message: 'Please provide the URL of the site you want to check.',
    },
    { onCancel },
    )

    if (isValidUrl(userWebsiteResponse.url)) {
      fs.writeFileSync(path.join(shell.pwd(), './__checks__/custom.spec.ts'),
        defaultBrowserCheck.replace(/URL_TO_CHECK/i, new URL(userWebsiteResponse.url).toString()))
    } else {
      process.stdout.write('Custom check wasn\'t created: the specified URL isn\'t valid.\n')
    }
  }
}
