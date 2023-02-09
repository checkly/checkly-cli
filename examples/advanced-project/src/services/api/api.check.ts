import { ApiCheck } from '@checkly/cli/constructs'
import { slackChannel, webhookChannel } from '../../alert-channels'

new ApiCheck('homepage-api-check-1', {
  name: 'Homepage - fetch stats',
  alertChannels: [slackChannel, webhookChannel],
  degradedResponseTime: 10000,
  maxResponseTime: 20000,
  request: {
    url: 'https://api.checklyhq.com/public-stats',
    method: 'GET',
    followRedirects: true,
    skipSsl: false,
    assertions: [
      { source: 'STATUS_CODE', property: '', comparison: 'EQUALS', target: '200', regex: '' },
      { source: 'JSON_BODY', regex: '', property: '$.apiCheckResults', comparison: 'GREATER_THAN', target: '0' }
    ],
  }
})
