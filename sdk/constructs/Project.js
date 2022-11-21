const Construct = require('./Construct')
const ValidationError = require('./ValidationError')

class Project extends Construct {
  constructor (logicalId, props) {
    super(logicalId)
    if (!props.name) {
      // TODO: Can we collect a list of validation errors and return them all at once? This might be better UX.
      throw new ValidationError('The project must have a name specified')
    }

    this.name = props.name
    this.repoUrl = props.repoUrl
    this.checks = {}
  }

  addCheck (check) {
    if (this.checks[check.logicalId]) {
      throw new ValidationError(`Detected multiple checks with the same logical ID ${check.logicalId}. Ensure that each check has a unique logical ID.`)
    }
    this.checks[check.logicalId] = check
  }

  synthesize () {
    const project = {
      logicalId: this.logicalId,
      name: this.name,
      repoUrl: this.repoUrl,
    }
    const checks = Object.values(this.checks).reduce((acc, check) => {
      acc[check.logicalId] = check.synthesize()
      return acc
    }, {})
    const groups = {}
    const alertChannels = {}
    return {
      project,
      checks,
      groups,
      alertChannels,
      // TODO: Why do we also have a list of alert subscriptions here? This is already included in the `checks`, no?
      alertChannelSubscriptions: {},
    }
  }
}

module.exports = Project
