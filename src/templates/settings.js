module.exports = ({ accountId, accountName, projectId, projectName }) => {
  return `account:
  id: ${accountId}
  name: ${accountName}
project:
  id: ${projectId}
  name: ${projectName}
settings:
  - locations: ['us-east-1', 'eu-central-1']
    interval: 5min
    alerts:
      - type: email
        sendOn:
          - recover
          - degrade
          - fail`
}
