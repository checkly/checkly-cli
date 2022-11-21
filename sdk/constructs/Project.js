const Construct = require('./Construct')
const ValidationError = require('./ValidationError')

class Project extends Construct {
  constructor (logicalId, props) {
    super(logicalId)
    if (!props.name) {
      throw new ValidationError('The project must have a name.')
    }
    this.name = props.name
    this.repoUrl = props.repoUrl
  }

  synthesize () {
    const project = {
      logicalId: this.logicalId,
      name: this.name,
      repoUrl: this.repoUrl,
    }
    const checks = {}
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
