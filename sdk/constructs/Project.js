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
    this.checkGroups = {}
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
      this.addAlertChannelSubscriptionCheck(check, alertChannel)
    })
  }

  addCheckGroup (checkGroup) {
    if (this.checkGroups[checkGroup.logicalId] && this.checkGroups[checkGroup.logicalId] !== checkGroup) {
      throw new ValidationError(`Detected multiple groups with the same logical ID ${checkGroup.logicalId}. Ensure that each group has a unique logical ID.`)
    }
    this.checkGroups[checkGroup.logicalId] = checkGroup
    checkGroup.checks.forEach(check => this.addCheck(check))
    checkGroup.alertChannelSubscriptions.forEach(alertChannel => {
      this.addAlertChannel(alertChannel)
      this.addAlertChannelSubscriptionCheckGroup(checkGroup, alertChannel)
    })
  }

  addAlertChannel (alertChannel) {
    if (this.alertChannels[alertChannel.logicalId] && this.alertChannels[alertChannel.logicalId] !== alertChannel) {
      throw new ValidationError(`Detected multiple alert channels with the same logical ID ${alertChannel.logicalId}. Ensure that each alert channel has a unique logical ID.`)
    }
    this.alertChannels[alertChannel.logicalId] = alertChannel
  }

  addAlertChannelSubscriptionCheck (check, alertChannel) {
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

  addAlertChannelSubscriptionCheckGroup (checkGroup, alertChannel) {
    // TODO: This is only safe if # is not allowed in user created logical IDs.
    // Rather than having to actually create an alert channel subscription entry,
    // could the BE create these automatically based on check.alertChannelSubscriptions?
    const logicalId = `check-alert-channel-subscription#${checkGroup.logicalId}#${alertChannel.logicalId}`
    if (this.alertChannelSubscriptions[logicalId]) {
      throw new ValidationError(`The check group ${checkGroup.logicalId} is already using alert channel ${alertChannel.logicalId}`)
    }
    this.alertChannelSubscriptions[logicalId] = {
      alertChannelId: { ref: alertChannel.logicalId },
      groupId: { ref: checkGroup.logicalId },
      activated: true,
    }
  }

  async synthesize () {
    const project = {
      logicalId: this.logicalId,
      name: this.name,
      repoUrl: this.repoUrl,
    }
    const checks = {}
    for (const check of Object.values(this.checks)) {
      checks[check.logicalId] = await check.synthesize()
    }
    const groups = {}
    for (const checkGroup of Object.values(this.checkGroups)) {
      groups[checkGroup.logicalId] = await checkGroup.synthesize()
    }
    const alertChannels = {}
    for (const alertChannel of Object.values(this.alertChannels)) {
      alertChannels[alertChannel.logicalId] = await alertChannel.synthesize()
    }
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
