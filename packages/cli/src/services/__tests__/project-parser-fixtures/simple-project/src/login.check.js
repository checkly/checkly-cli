/* eslint-disable no-new */
import { BrowserCheck } from 'checkly/constructs'

new BrowserCheck('browser-check-1', {
  name: 'login check',
  locations: ['eu-central-1'],
  frequency: 10,
  code: {
    content: 'console.log("performing login")',
  },
})
