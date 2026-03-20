import { AgenticCheck } from 'checkly/constructs'

new AgenticCheck('homepage-health', {
  name: 'Homepage Health Check',
  prompt: 'Navigate to https://example.com and verify the page loads correctly.',
  activated: true,
  frequency: 30,
  locations: ['us-east-1', 'eu-west-1'],
})
