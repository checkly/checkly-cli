/* eslint-disable no-new */
import { ApiCheck, CheckGroupV2 } from 'checkly/constructs'

const executionId = process.env.EXECUTION_ID!

const prodBackendGroup = new CheckGroupV2('prod-backend-group', {
  name: 'Production Backend Group (Trigger Test)',
  locations: ['eu-central-1'],
  tags: ['production', 'backend', executionId, 'additional-tag'],
})

new ApiCheck('prod-backend-check', {
  name: 'Prod Backend Check (Trigger Test)',
  activated: false,
  request: {
    url: 'https://www.google.com',
    method: 'GET',
    followRedirects: false,
    skipSSL: false,
    assertions: [],
  },
  group: prodBackendGroup,
})

new ApiCheck('prod-frontend-check', {
  name: 'Prod Frontend Check (Trigger Test)',
  activated: false,
  request: {
    url: 'https://www.google.com',
    method: 'GET',
    followRedirects: false,
    skipSSL: false,
    assertions: [],
  },
  tags: ['production', 'frontend', executionId, 'another-tag'],
  // Log the secret environment variable passed to `checkly trigger`
  setupScript: { content: 'console.log(process.env.SECRET_ENV)' },
})

new ApiCheck('staging-backend-check', {
  name: 'Staging Backend Check (Trigger Test)',
  activated: false,
  request: {
    url: 'https://www.google.com',
    method: 'GET',
    followRedirects: false,
    skipSSL: false,
    assertions: [],
  },
  tags: ['staging', 'backend', executionId],
})
