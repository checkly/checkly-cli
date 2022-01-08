module.exports = ({ projectId, projectName, runtimeId = '2021.10', locations = ['us-east-1', 'eu-central-1'] } = {}) => {
  return `projectId: ${projectId}
projectName: ${projectName}

# Default check settings will be used when you don't specify  them at check or group level
defaultCheckSettings:
  runtimeId: ${runtimeId}
  locations:
    - ${locations.join('\n    - ')}
`
}
