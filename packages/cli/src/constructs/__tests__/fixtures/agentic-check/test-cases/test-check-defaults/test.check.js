import { AgenticCheck } from 'checkly/constructs'

new AgenticCheck('check-should-have-defaults', {
  name: 'Check With Defaults',
  prompt: 'Verify the homepage loads.',
})

new AgenticCheck('check-should-not-have-defaults', {
  name: 'Check Without Defaults',
  prompt: 'Verify the homepage loads.',
  tags: ['not default tags'],
})
