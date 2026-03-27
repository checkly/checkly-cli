import { AgenticCheck } from 'checkly/constructs'

new AgenticCheck('long-prompt', {
  name: 'Long Prompt Check',
  prompt: 'x'.repeat(10001),
})
