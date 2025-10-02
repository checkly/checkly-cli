const { join } = require('path')
const { MultiStepCheck, Frequency } = require('checkly/constructs')

new MultiStepCheck('multistep-check-1', {
  name: 'Multistep API check',
  frequency: Frequency.EVERY_1H,
  locations: ['us-east-1', 'eu-west-1'],
  code: {
    entrypoint: join(__dirname, '05-multi-step-api.spec.js')
  },
})
