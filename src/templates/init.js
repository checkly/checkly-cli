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

const checkTemplate = () => {
  return `type: browser
name: Example Check #1
url: https://jsonplaceholder.typicode.com/users
    `
}

module.exports = {
  settingsTemplate,
  checkTemplate,
}
