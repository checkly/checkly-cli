import { AgenticCheck } from 'checkly/constructs'

// Agentic checks are AI-powered: instead of writing code, you describe what
// the check should do in natural language and the agent figures out how.
// Read more at: https://www.checklyhq.com/docs/agentic-checks/

new AgenticCheck('checkly-pricing-page', {
  name: 'Checkly pricing page',
  prompt:
    'Navigate to https://www.checklyhq.com/pricing and verify that at least three plan tiers are displayed on the page.',
  // The backend enforces the allowed cadence and region count for your account.
  frequency: 5,
  locations: ['us-east-1', 'eu-west-1', 'ap-southeast-1'],
})
