import { AgenticCheck } from 'checkly/constructs'

new AgenticCheck('empty-env-var', {
  name: 'Bad env var entry',
  prompt: 'Verify the homepage loads.',
  agentRuntime: {
    environmentVariables: ['  '],
  },
})
