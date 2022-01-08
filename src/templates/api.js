const DEFAULT_URL = 'https://checklyhq.com'
const DEFAULT_LOCATIONS = ['us-east-1', 'eu-west-1']
const DEFAULT_FREQUENCY = 10
const DEFAULT_NAME = 'API Check'
const DEFAULT_STATUS_CODE = 200

module.exports = {
  basic: ({
    name = DEFAULT_NAME,
    url = DEFAULT_URL,
    locations = DEFAULT_LOCATIONS,
    frequency = DEFAULT_FREQUENCY,
    statusCode = DEFAULT_STATUS_CODE,
    frequencyOffset = 0
  } = {}) => {
    return `checkType: API
name: ${name}
request:
  url: ${url}
  method: GET
  assertions:
    - source: 'STATUS_CODE'
      target: '${statusCode}'
      comparison: 'EQUALS'
frequency: ${frequency}
frequencyOffset: ${frequencyOffset}
activated: true
locations:
  - ${locations.join('\n  - ')}
`
  },

  advanced: ({
    name = DEFAULT_NAME,
    url = DEFAULT_URL,
    locations = DEFAULT_LOCATIONS,
    frequency = DEFAULT_FREQUENCY,
    statusCode = DEFAULT_STATUS_CODE,
    frequencyOffset = 0
  } = {}) => {
    return `checkType: API
name: ${name}
request:
  url: ${url}
  method: GET
  assertions:
    - source: 'STATUS_CODE'
      target: '${statusCode}'
      comparison: 'EQUALS'
frequency: ${frequency}
frequencyOffset: ${frequencyOffset}
activated: true
muted: false
doubleCheck: true
locations:
  - ${locations.join('\n  - ')}

alertSettings:
  muted: false
  escalationType: RUN_BASED
  runBasedEscalation:
    failedRunThreshold: 1
  timeBasedEscalation:
    minutesFailingThreshold: 5
  reminders:
    amount: 0
    interval: 5
  sslCertificates:
    enabled: true
    alertThreshold: 30
useGlobalAlertSettings: true
environmentVariables: []
tags: []
`
  }
}
