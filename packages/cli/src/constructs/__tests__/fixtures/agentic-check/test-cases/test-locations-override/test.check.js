import { AgenticCheck } from 'checkly/constructs'

new AgenticCheck('locations-overridden', {
  name: 'Agentic check with project-default locations',
  prompt: 'Verify the homepage loads.',
})
