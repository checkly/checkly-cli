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
    this.alertChannels = {}
    this.alertChannelSubscriptions = {}
  }

  addCheck (check) {
    if (this.checks[check.logicalId] && this.checks[check.logicalId] !== check) {
      throw new ValidationError(`Detected multiple checks with the same logical ID ${check.logicalId}. Ensure that each check has a unique logical ID.`)
    }
    this.checks[check.logicalId] = check
    check.alertChannelSubscriptions.forEach(alertChannel => {
      this.addAlertChannel(alertChannel)
      this._addAlertChannelSubscriptionCheck(check, alertChannel)
    })
  }

  addAlertChannel (alertChannel) {
    if (this.alertChannels[alertChannel.logicalId] && this.alertChannels[alertChannel.logicalId] !== alertChannel) {
      throw new ValidationError(`Detected multiple alert channels with the same logical ID ${alertChannel.logicalId}. Ensure that each alert channel has a unique logical ID.`)
    }
    this.alertChannels[alertChannel.logicalId] = alertChannel
  }

  _addAlertChannelSubscriptionCheck (check, alertChannel) {
    // TODO: This is only safe if # is not allowed in user created logical IDs.
    // Rather than having to actually create an alert channel subscription entry,
    // could the BE create these automatically based on check.alertChannelSubscriptions?
    const logicalId = `check-alert-channel-subscription#${check.logicalId}#${alertChannel.logicalId}`
    if (this.alertChannelSubscriptions[logicalId]) {
      throw new ValidationError(`The check ${check.logicalId} is already using alert channel ${alertChannel.logicalId}`)
    }
    this.alertChannelSubscriptions[logicalId] = {
      alertChannelId: { ref: alertChannel.logicalId },
      checkId: { ref: check.logicalId },
      activated: true,
    }
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
    const alertChannels = Object.values(this.alertChannels).reduce((acc, alertChannel) => {
      acc[alertChannel.logicalId] = alertChannel.synthesize()
      return acc
    }, {})
    const alertChannelSubscriptions = this.alertChannelSubscriptions
    return {
      project,
      checks,
      groups,
      alertChannels,
      alertChannelSubscriptions,
    }
  }
}

module.exports = Project
