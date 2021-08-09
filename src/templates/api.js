const DEFAULT_URL = 'https://checklyhq.com'

module.exports = {
  basic: ({ url = DEFAULT_URL }) => {
    return `checkType: API
  name: API Check #1
  url: ${url}
  frequency: 10
  locations:
  - eu-central-1
  - eu-west-3`
  },

  advanced: ({ url = DEFAULT_URL }) => {
    return `checkType: API
  name: 'API Check #1'
  url: ${url}
  frequency: 10
  activated: true
  muted: false
  doubleCheck: true
  locations:
  - eu-central-1
  - eu-west-3

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
  tags: []`
  },
}
