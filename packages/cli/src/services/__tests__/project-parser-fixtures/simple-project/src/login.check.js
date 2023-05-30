/* eslint-disable no-new */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { BrowserCheck } = require('../../../../../constructs')

new BrowserCheck('check-1', {
  name: 'login check',
  locations: ['eu-central-1'],
  frequency: 10,
  code: {
    content: 'console.log("performing login")',
  },
})
