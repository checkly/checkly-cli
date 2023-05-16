import { ApiCheck, AssertionBuilder, Frequency } from 'checkly/constructs'
import { slackChannel, webhookChannel } from '../../../alert-channels'

/**
 * This API Check is picked up using the defaults from the checkly.config.ts file at the root of this example.
 */

new ApiCheck('example-api-check-not-grouped-1', {
  name: 'API Check not in a Group',
  alertChannels: [slackChannel, webhookChannel],
  degradedResponseTime: 10000,
  maxResponseTime: 20000,
  request: {
    url: 'https://danube-web.shop/api/books',
    method: 'GET',
    followRedirects: true,
    skipSSL: false,
    assertions: [
      AssertionBuilder.statusCode().equals(200),
      AssertionBuilder.jsonBody('$[0].id').isNotNull(),
    ],
  }
})

new ApiCheck('example-api-check-high-frequency', {
  name: 'API Check with High Frequency',
  alertChannels: [slackChannel, webhookChannel],
  degradedResponseTime: 10000,
  frequency: Frequency.EVERY_30S,
  maxResponseTime: 20000,
  request: {
    url: 'https://danube-web.shop/api/books',
    method: 'GET',
    followRedirects: true,
    skipSSL: false,
    assertions: [
      AssertionBuilder.statusCode().equals(200),
      AssertionBuilder.jsonBody('$[0].id').isNotNull(),
    ],
  }
})
