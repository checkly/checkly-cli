const Construct = require('./Construct')

// This is an abstract class. It shouldn't be used directly.
class Check extends Construct {
  constructor (logicalId, props) {
    super(logicalId)
    this.name = props.name
    this.alertChannels = null // TODO: Just track the alert channel subscriptions...
    this.activated = props.activated
    this.muted = props.muted
    this.doubleCheck = props.doubleCheck
    this.shouldFail = props.shouldFail
    this.locations = props.locations
    this.tags = props.tags
    this.frequency = props.frequency
    // TODO:
    // alertSettings, useGlobalAlertSettings, groupId, groupOrder, runtimeId, alertChannelSubscriptions
  }

  synthesize () {
    return {
      name: this.name,
      alertChannels: this.alertChannels,
      activated: this.activated,
      muted: this.muted,
      doubleCheck: this.doubleCheck,
      shouldFail: this.shouldFail,
      locations: this.locations,
      tags: this.tags,
      frequency: this.frequency,
    }
  }
}

module.exports = Check
