const Construct = require('./Construct')

const defaultApiCheckDefaults = {
  headers: [],
  queryParameters: [],
  url: '',
  basicAuth: {
    username: '',
    password: '',
  },
}

class CheckGroup extends Construct {
  constructor (logicalId, props) {
    super(logicalId)
    this.name = props.name
    this.activated = props.activated
    this.muted = props.muted
    this.tags = props.tags
    this.locations = props.locations
    this.concurrency = props.concurrency
    this.checks = props.checks ?? []
    this.checks.forEach(check => {
      check.groupId = { ref: logicalId }
    })
    this.apiCheckDefaults = props.apiCheckDefaults || defaultApiCheckDefaults
    this.browserCheckDefaults = props.browserCheckDefaults || {}
    this.environmentVariables = props.environmentVariables
    // TODO: Add additional fields
  }

  synthesize () {
    return {
      name: this.name,
      activated: this.activated,
      muted: this.muted,
      tags: this.tags,
      locations: this.locations,
      concurrency: this.concurrency,
      apiCheckDefaults: this.apiCheckDefaults,
      browserCheckDefaults: this.browserCheckDefaults,
      environmentVariables: this.environmentVariables,
    }
  }
}

module.exports = CheckGroup
