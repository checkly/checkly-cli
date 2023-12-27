/* eslint-disable no-new */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { BrowserCheck } = require('../../../../../constructs')

new BrowserCheck('check1', {
  name: 'check1',
  runtimeId: '2022.10',
  locations: ['eu-central-1'],
  frequency: 10,
  environmentVariables: [],
  alertChannels: [],
  code: {
    content: 'console.log(1)',
  },
})
