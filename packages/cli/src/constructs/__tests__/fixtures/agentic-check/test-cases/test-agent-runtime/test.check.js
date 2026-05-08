import { AgenticCheck } from 'checkly/constructs'

new AgenticCheck('agent-runtime-check', {
  name: 'Agent runtime check',
  prompt: 'Sign in to the test account and verify the dashboard loads.',
  agentRuntime: {
    skills: ['addyosmani/web-quality-skills'],
  },
})

new AgenticCheck('default-agent-runtime', {
  name: 'Defaults agent runtime',
  prompt: 'Verify the homepage loads.',
})
