import { defineConfig } from 'checkly'
import { AlertEscalationBuilder, RetryStrategyBuilder } from 'checkly/constructs'

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
