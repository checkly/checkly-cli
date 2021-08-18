const DEFAULT_LOCATIONS = ['us-east1', 'eu-west-1']

module.exports = ({ name, locations = DEFAULT_LOCATIONS }) => {
  return `name: ${name}
settings:
  - ${locations.join('\n  - ')}
`
}
