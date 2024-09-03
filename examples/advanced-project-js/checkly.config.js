const { defineConfig } = require('checkly');
const { RetryStrategyBuilder } = require('checkly/constructs');

/**
 * See https://www.checklyhq.com/docs/cli/project-structure/
 */
const config = defineConfig({
  /* A human friendly name for your project */
  projectName: 'Advanced Example Project',
  /** A logical ID that needs to be unique across your Checkly account,
   * See https://www.checklyhq.com/docs/cli/constructs/ to learn more about logical IDs.
   */
  logicalId: 'advanced-example-project',
  /* An optional URL to your Git repo to be shown in your test sessions and resource activity log */
  /* repoUrl: 'https://github.com/checkly/checkly-cli', */
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
    runtimeId: '2024.02',
    /* Failed check runs will be retried before triggering alerts */
    retryStrategy: RetryStrategyBuilder.fixedStrategy({ baseBackoffSeconds: 60, maxRetries: 4, sameRegion: true }),
    /* A glob pattern that matches the Checks inside your repo, see https://www.checklyhq.com/docs/cli/using-check-test-match/ */
    checkMatch: '**/__checks__/**/*.check.js',
    /* Global configuration option for Playwright-powered checks. See https://docs/browser-checks/playwright-test/#global-configuration */
    playwrightConfig: {
      timeout: 30000,
      use: {
        baseURL: 'https://www.danube-web.shop',
        viewport: { width: 1280, height: 720 },
      }
    },
    browserChecks: {
      /* A glob pattern matches any Playwright .spec.js files and automagically creates a Browser Check. This way, you
       * can just write native Playwright code. See https://www.checklyhq.com/docs/cli/using-check-test-match/
       * */
      testMatch: '**/__checks__/**/*.spec.js',
    },
  },
  cli: {
    /* The default datacenter location to use when running npx checkly test */
    runLocation: 'eu-west-1',
    /* An array of default reporters to use when a reporter is not specified with the "--reporter" flag */
    reporters: ['list'],
    /* How many times to retry a failing test run when running `npx checkly test` or `npx checkly trigger` (max. 3) */
    retries: 0,
  },
});

module.exports = config;
