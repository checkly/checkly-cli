const settingsTemplate = ({ accountId, name, projectName }) => {
  return `account: 
  - id: ${accountId}
    name: ${name}
project: ${projectName}
checkDefaults:
  - locations: ['us-east-1', 'eu-central-1']
    interval: 5min
    alerts:
      - type: email
        sendOn:
          - recover
          - degrade
          - fail`
}

module.exports = {
  settingsTemplate,
}
