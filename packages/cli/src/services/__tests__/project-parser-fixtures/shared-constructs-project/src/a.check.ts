import { ApiCheck } from 'checkly/constructs'

import { group, ops } from './shared/alerts.js'

new ApiCheck('a', {
  name: 'A',
  group,
  alertChannels: [ops],
  request: {
    method: 'GET',
    url: 'https://api.example.com/a',
  },
})
