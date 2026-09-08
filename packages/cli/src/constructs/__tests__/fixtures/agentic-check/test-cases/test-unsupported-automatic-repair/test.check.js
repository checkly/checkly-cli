import { AgenticCheck } from 'checkly/constructs'

// JavaScript callers can supply an unsupported property despite the public
// TypeScript props excluding it. The construct must not synthesize it.
new AgenticCheck('unsupported-automatic-repair', {
  name: 'Unsupported automatic repair',
  prompt: 'Verify that https://example.com is available.',
  aiAutoRepairEnabled: true,
})
