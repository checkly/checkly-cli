module.exports = ({ projectId, projectName, locations = ['us-east-1', 'eu-central-1'] } = {}) => {
  return `projectId: ${projectId}
projectName: ${projectName}

# Default check settings will be used when you don't specify  them at check or group level
defaultCheckSettings:
  frequency: 10
  runtimeId: "2021.10"
  locations:
    - ${locations.join('\n  - ')}
  activated: true
  muted: false
  doubleCheck: true
  alertSettings:
    escalationType: "RUN_BASED"
    runBasedEscalation:
      failedRunThreshold: 1
    timeBasedEscalation:
      minutesFailingThreshold: 5
    reminders:
      amount: 0
      interval: 5
    sslCertificates:
      enabled: false
      alertThreshold: 30
`
}
