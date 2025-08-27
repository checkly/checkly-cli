import { MultiStepCheck, Frequency } from 'checkly/constructs'
import * as path from 'path'

new MultiStepCheck('multistep-check-1', {
  name: 'Multistep API check',
  frequency: Frequency.EVERY_1H,
  locations: ['us-east-1'],
  code: {
    entrypoint: path.join(__dirname, '05-multi-step-api.spec.ts')
  },
})
