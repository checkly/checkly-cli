/* eslint-disable */
import { AgenticCheck, Frequency } from 'checkly/constructs'

new AgenticCheck('agentic-pricing-check', {
  name: 'Agentic Pricing Check',
  prompt:
    'Navigate to https://www.checklyhq.com/pricing and verify that at least three plan tiers are displayed on the page.',
  activated: false,
  muted: true,
  frequency: Frequency.EVERY_1H,
  tags: ['e2e', 'agentic'],
})

new AgenticCheck('agentic-runtime-check', {
  name: 'Agentic Runtime Check',
  prompt:
    'Navigate to https://www.checklyhq.com and verify the homepage loads with the main heading visible.',
  activated: false,
  muted: true,
  frequency: 60,
  agentRuntime: {
    skills: ['addyosmani/web-quality-skills'],
    exposeEnvironmentVariables: [
      'ENVIRONMENT_URL',
      { name: 'TEST_USER_EMAIL', description: 'Login email for the test account' },
    ],
  },
})
