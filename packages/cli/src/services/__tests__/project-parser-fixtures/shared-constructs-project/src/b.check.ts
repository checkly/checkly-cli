import { ApiCheck } from 'checkly/constructs'

import { group, ops } from './shared/alerts.js'
import './shared/checks.js'
import './shared/browser.js'
import './shared/legacy-group.js'

new ApiCheck('b', {
  name: 'B',
  group,
  alertChannels: [ops],
  request: {
    method: 'GET',
    url: 'https://api.example.com/b',
  },
})
