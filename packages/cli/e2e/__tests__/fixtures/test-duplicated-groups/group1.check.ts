/* eslint-disable */
import { ApiCheck, BrowserCheck, CheckGroupV2 } from 'checkly/constructs'

const group2 = new CheckGroupV2('my-check-group', {
  name: 'My Group',
  locations: ['us-east-1']
})

new BrowserCheck('browser-check', {
  name: 'Browser Check',
  activated: false,
  code: {
    // Remove the throw new Error when we support a verbose flag for check output
    content: 'console.info(process.env.SECRET_ENV);'
  },
  group: group2,
})
