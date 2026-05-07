import { AgenticCheck } from 'checkly/constructs'

new AgenticCheck('locations-explicit', {
  name: 'Agentic check with explicit locations',
  prompt: 'Verify the homepage loads.',
  locations: ['us-east-1', 'eu-west-1', 'ap-southeast-1'],
})
