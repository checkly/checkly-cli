import { ApiCheck, AssertionBuilder } from 'checkly/constructs'
import { slackChannel, webhookChannel } from '../../alert-channels'

const apiCheck = new ApiCheck('homepage-api-check-1', {
  name: 'Public Stats',
  alertChannels: [slackChannel, webhookChannel],
  degradedResponseTime: 10000,
  maxResponseTime: 20000,
  request: {
    url: 'https://api.checklyhq.com/public-stats',
    method: 'GET',
    followRedirects: true,
    skipSSL: false,
    assertions: [
      AssertionBuilder.statusCode().equals(200),
      AssertionBuilder.jsonBody('$.apiCheckResults').greaterThan(0),
    ],
  },
})

const skipSslApiCheck = new ApiCheck('ssl-api-check-1', {
  name: 'Skip SSL Check',
  alertChannels: [slackChannel, webhookChannel],
  degradedResponseTime: 10000,
  maxResponseTime: 20000,
  request: {
    url: 'https://self-signed.badssl.com/',
    method: 'GET',
    followRedirects: true,
    skipSSL: true,
    assertions: [
      AssertionBuilder.statusCode().equals(200),
    ],
  },
})
