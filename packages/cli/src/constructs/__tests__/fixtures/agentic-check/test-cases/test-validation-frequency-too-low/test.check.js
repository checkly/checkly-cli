import { AgenticCheck } from 'checkly/constructs'

new AgenticCheck('low-frequency', {
  name: 'Low Frequency Check',
  prompt: 'Verify the homepage loads.',
  frequency: 15,
})
