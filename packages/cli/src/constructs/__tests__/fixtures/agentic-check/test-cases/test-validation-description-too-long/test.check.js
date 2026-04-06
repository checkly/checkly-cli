import { AgenticCheck } from 'checkly/constructs'

new AgenticCheck('long-description', {
  name: 'Description too long',
  prompt: 'Verify the homepage loads.',
  agentRuntime: {
    environmentVariables: [
      { name: 'API_KEY', description: 'x'.repeat(201) },
    ],
  },
})
