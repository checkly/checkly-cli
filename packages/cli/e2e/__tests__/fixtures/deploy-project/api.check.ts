/* eslint-disable */
import { ApiCheck, Frequency } from 'checkly/constructs'
import { privateLocation } from './private-location.check'
new ApiCheck('api-check', {
  name: 'Api Check',
  activated: false,
  request: {
    url: 'https://www.google.com',
    method: 'GET',
    followRedirects: false,
    skipSSL: false,
    assertions: []
  },
  privateLocations: [privateLocation],
  localSetupScript: "console.log('hi from setup')",
  localTearDownScript: "console.log('hi from teardown')",
  degradedResponseTime: 20000,
  maxResponseTime: 30000
})

new ApiCheck('api-check-high-freq', {
  name: 'Api Check High Freq',
  activated: false,
  frequency: Frequency.EVERY_30S,
  request: {
    url: 'https://www.google.com',
    method: 'GET',
    followRedirects: false,
    skipSSL: false,
    assertions: []
  },
  localSetupScript: "console.log('hi from setup')",
  localTearDownScript: "console.log('hi from teardown')",
  degradedResponseTime: 20000,
  maxResponseTime: 30000
})

