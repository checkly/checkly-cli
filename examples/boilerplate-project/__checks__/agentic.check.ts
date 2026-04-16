import { AgenticCheck } from 'checkly/constructs'

// Agentic checks are AI-powered: instead of writing code, you describe what
// the check should do in natural language and the agent figures out how.
// Read more at: https://www.checklyhq.com/docs/agentic-checks/

new AgenticCheck('checkly-pricing-page', {
  name: 'Checkly pricing page',
  prompt:
    'Navigate to https://www.checklyhq.com/pricing and verify that at least three plan tiers are displayed on the page.',
  // Agentic checks currently run from a single location and follow their own
  // frequency cadence (30, 60, 120, 180, 360, 720 or 1440 minutes). The
  // construct hardcodes the location and validates the frequency for you.
  frequency: 60,
})
