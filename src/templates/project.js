module.exports = ({ projectId, projectName } = {}) => {
  return `projectId: ${projectId}
projectName: ${projectName}
locations: ['us-east-1', 'eu-central-1']
interval: 5min
alerts:
  - type: email
    sendOn:
      - recover
      - degrade
      - fail`
}
