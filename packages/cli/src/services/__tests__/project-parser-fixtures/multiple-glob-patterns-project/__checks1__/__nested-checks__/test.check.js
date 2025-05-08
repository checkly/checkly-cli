/* eslint-disable no-new */
import { BrowserCheck } from '../../../../../../constructs'

new BrowserCheck('nested', {
  name: 'nested',
  runtimeId: '2022.10',
  locations: ['eu-central-1'],
  frequency: 10,
  environmentVariables: [],
  alertChannels: [],
  code: {
    content: 'console.log(1)',
  },
})
