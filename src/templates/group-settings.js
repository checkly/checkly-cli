module.exports = ({ name }) => {
  return `name: ${name}
locations:
  - us-east-1
  - eu-central-1
browserCheckDefaults: {}
apiCheckDefaults:
  url: ''
  headers: []
  assertions: []
  queryParameters: []`
}
