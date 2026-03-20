import { AgenticCheck } from 'checkly/constructs'

new AgenticCheck('missing-prompt', {
  name: 'Missing Prompt Check',
  prompt: '',
})
