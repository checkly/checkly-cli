/* eslint-disable */
import { ApiCheck, BrowserCheck } from 'checkly/constructs'

new ApiCheck('not-testonly-default-check', {
  name: 'TestOnly=false (default) Check',
  request: {
    url: 'https://www.google.com',
    method: 'GET',
    assertions: []
  },
  activated: false,
})

new ApiCheck('testonly-true-check', {
  name: 'TestOnly=true Check',
  request: {
    url: 'https://www.google.com',
    method: 'GET',
    assertions: []
  },
  activated: false,
  testOnly: process.env.TEST_ONLY === 'true',
})

new ApiCheck('not-testonly-false-check', {
  name: 'TestOnly=false Check',
  request: {
    url: 'https://www.google.com',
    method: 'GET',
    assertions: []
  },
  activated: false,
  testOnly: false,
})
