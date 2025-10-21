const path = require('path')
const { MultiStepCheck, Frequency } = require('checkly/constructs')
const { syntheticGroup } = require('../utils/website-groups.check')

new MultiStepCheck('multistep-check-1', {
  name: 'Multistep API check',
  group: syntheticGroup,
  frequency: Frequency.EVERY_1H,
  locations: ['us-east-1', 'eu-west-1'],
  code: {
    entrypoint: path.join(__dirname, '05-multi-step-api.spec.js')
  },
})
