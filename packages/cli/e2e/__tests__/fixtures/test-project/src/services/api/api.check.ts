import { ApiCheck, AssertionBuilder } from 'checkly/constructs'
import { slackChannel, webhookChannel } from '../../alert-channels'

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
