import { defineConfig } from 'checkly'

/**
 * See https://www.checklyhq.com/docs/cli/project-structure/
 */
const config = defineConfig({
  /* A human friendly name for your project */
  projectName: 'Boilerplate Project',
  /** A logical ID that needs to be unique across your Checkly account,
  * See https://www.checklyhq.com/docs/cli/constructs/ to learn more about logical IDs.
  */
  logicalId: 'boilerplate-project',
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
    runtimeId: '2025.04',
    /* A glob pattern that matches the Checks inside your repo, see https://www.checklyhq.com/docs/cli/using-check-test-match/ */
    checkMatch: '**/__checks__/**/*.check.ts',
    /* Global configuration option for Browser and Multistep checks. See https://www.checklyhq.com/docs/browser-checks/playwright-test/#global-configuration */
    playwrightConfig: {
      timeout: 30000,
      use: {
        baseURL: 'https://www.danube-web.shop',
        viewport: { width: 1280, height: 720 },
      }
    },
    browserChecks: {
      /* A glob pattern matches any Playwright .spec.ts files and automagically creates a Browser Check. This way, you
      * can just write Playwright code. See https://www.checklyhq.com/docs/constructs/including-checks/#browserchecks-testmatch
      * */
      testMatch: '**/__checks__/**/*.spec.ts',
    },
    // Playwright Check Suites definition, run the whole Playwright Test Suite in a Check
    playwrightConfigPath: './playwright.config.ts',
    playwrightChecks: [
      {
        logicalId: 'playwright-check-suite',
        name: 'Playwright Check Suite Simple TS',
        //Use `testCommand: npx playwright test` to filter the tests you want to run
      }
    ],
  },
  cli: {
    /* The default datacenter location to use when running npx checkly test */
    runLocation: 'eu-west-1',
    /* An array of default reporters to use when a reporter is not specified with the "--reporter" flag */
    reporters: ['list'],
    /* How many times to retry a failing test run when running `npx checkly test` or `npx checkly trigger` (max. 3) */
    retries: 0,
  },
})

export default config
