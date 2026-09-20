import { ApiCheck } from 'checkly/constructs'

import { group } from './alerts.js'

export const sharedApi = new ApiCheck('shared-api', {
  name: 'Shared API',
  group,
  request: {
    method: 'GET',
    url: 'https://api.example.com/shared',
  },
})
