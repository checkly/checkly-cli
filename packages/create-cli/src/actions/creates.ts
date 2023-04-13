import * as fs from 'fs'
import prompts from 'prompts'
const checklyConfigTsFile = `import { defineConfig } from '@checkly/cli'

/**
 * See https://www.checklyhq.com/docs/cli/project-structure/
 */
const config = defineConfig({
  /* A human friendly name for your project */
  projectName: 'package.name should be here',
  /** A logical ID that needs to be unique across your Checkly account,
  * See https://www.checklyhq.com/docs/cli/constructs/ to learn more about logical IDs.
  */
  logicalId: 'package-name-here',
  /* An optional URL to your Git repo */
  repoUrl: 'https://github.com/checkly/checkly-cli',
  /* Sets default values for Checks */
  checks: {
    /* A default for how often your Check should run in minutes */
    frequency: 10,
    /* Checkly data centers to run your Checks as monitors */
    locations: ['us-east-1', 'eu-west-1'],
    /* An optional array of tags to organize your Checks */
    tags: ['mac'],
    /** The Checkly Runtime identifier, determining npm packages and the Node.js version available at runtime.
     * See https://www.checklyhq.com/docs/cli/npm-packages/
     */
    runtimeId: '2022.10',
    /* A glob pattern that matches the Checks inside your repo, see https://www.checklyhq.com/docs/cli/using-check-test-match/ */
    checkMatch: '**/__checks__/**/*.check.ts',
    browserChecks: {
      /* A glob pattern matches any Playwright .spec.ts files and automagically creates a Browser Check. This way, you
      * can just write native Playwright code. See https://www.checklyhq.com/docs/cli/using-check-test-match/
      * */
      testMatch: '**/__checks__/**/*.spec.ts',
    },
  },
  cli: {
    /* The default datacenter location to use when running npx checkly test */
    runLocation: 'eu-west-1',
  },
})

export default config
`

export function createConfigFile () {
  fs.writeFileSync('./checkly.config.ts', checklyConfigTsFile)
}

export async function createInitialBrowserCheck (
  { onCancel }: { onCancel: () => void },
) {
  const createInitialBrowserCheckResponse = await prompts({
    type: 'confirm',
    name: 'value',
    message: 'Would you like to create an initial Browser Check?',
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

    fs.writeFileSync('./__checks__/homepage.spec.ts', `import { test, expect } from '@playwright/test'

// You can override the default Playwright test timeout of 30s
// test.setTimeout(60_000);

test('Checkly Homepage', async ({ page }) => {
  const response = await page.goto('${userWebsiteResponse.url}')
  expect(response?.status()).toBeLessThan(400)
  await page.screenshot({ path: 'homepage.jpg' })
})`)
  }
}

export function createChecksFolder () {
  const dirPath = './__checks__'
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath)
  }
}
