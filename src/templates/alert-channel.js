module.exports = {
  email: ({
    email = 'your@email.com'
  } = {}) => {
    return `type: EMAIL
config:
  email: ${email}
`
  },

  slack: ({
    url = 'https://slack-webhook-url.com',
    channel = '#channel'
  } = {}) => {
    return `type: SLACK
config:
  url: ${url}
  channel: ${channel}
`
  },

  sms: ({
    number = '+5412345678'
  } = {}) => {
    return `type: SMS
config:
  number: ${number}
`
  },

  webhook: ({ name = 'webhook', url = 'https://webhook-url.com' } = {}) => {
    return `type: WEBHOOK
config:
  name: ${name}
  url: ${url}
`
  },

  pagerduty: ({ serviceKey = '123', account = 'account', serviceName = 'service name' } = {}) => {
    return `type: PAGERDUTY
config:
  account: ${account}
  serviceKey: ${serviceKey}
  serviceName: ${serviceName}
`
  },

  opsgenie: ({ name = 'name', apiKey = '123', priority = 'P1', region = 'US' } = {}) => {
    return `type: OPSGENIE
config:
  name: ${name}
  apiKey: ${apiKey}
  priority: ${priority},
  region: ${region},
`
  }
}
