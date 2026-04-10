import { AgenticCheck } from 'checkly/constructs'

new AgenticCheck('agent-runtime-check', {
  name: 'Agent runtime check',
  prompt: 'Sign in to the test account and verify the dashboard loads.',
  agentRuntime: {
    skills: ['addyosmani/web-quality-skills'],
    exposeEnvironmentVariables: [
      'API_KEY',
      { name: 'TEST_USER_PASSWORD', description: 'Login password for the test account' },
    ],
  },
})

new AgenticCheck('default-agent-runtime', {
  name: 'Defaults agent runtime',
  prompt: 'Verify the homepage loads.',
})
