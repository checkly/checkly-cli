const {ApiCheck} = require("@checkly/cli/dist/constructs");
const { slackChannel, webhookChannel } = require('../../alert-channels')

new ApiCheck('homepage-api-check-1', {
  name: 'Homepage - fetch stats',
  request: {
    url: 'https://api.checklyhq.com/public-stats',
    method: 'GET',
    followRedirects: true,
    skipSsl: false,
    alertChannels: [slackChannel, webhookChannel],
    assertions: [
      { source: 'STATUS_CODE', property: '', comparison: 'EQUALS', target: '200', regex: '' },
      { source: 'JSON_BODY', regex: '', property: '$.apiCheckResults', comparison: 'GREATER_THAN', target: '0' }
    ],
  }
})
