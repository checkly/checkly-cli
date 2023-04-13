import * as fs from 'fs'
import prompts from 'prompts'

export async function createCustomBrowserCheck (
  { onCancel }: { onCancel: () => void },
) {
  const createInitialBrowserCheckResponse = await prompts({
    type: 'confirm',
    name: 'value',
    message: 'Would you like to create a custom Browser Check?',
    initial: true,
  },
  { onCancel },
  )

  if (createInitialBrowserCheckResponse.value) {
    const userWebsiteResponse = await prompts({
      type: 'text',
      name: 'url',
      message: 'Could you provide your website homepage URL?',
    },
    { onCancel },
    )

    fs.writeFileSync('./__checks__/custom.spec.ts', `import { test, expect } from '@playwright/test'

// You can override the default Playwright test timeout of 30s
// test.setTimeout(60_000);

test('Custom Browser Check', async ({ page }) => {
  const response = await page.goto('${userWebsiteResponse.url}')
  expect(response?.status()).toBeLessThan(400)
  await page.screenshot({ path: 'screenshot.jpg' })
})`)
  }
}
