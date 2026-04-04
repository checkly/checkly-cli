import { AgenticCheck, CheckGroupV2 } from 'checkly/constructs'

const group = new CheckGroupV2('test-group', {
  name: 'Test Group',
})

new AgenticCheck('check', {
  name: 'Agentic Check in Group',
  prompt: 'Verify the homepage loads.',
  group,
})
