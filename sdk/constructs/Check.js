const Construct = require('./Construct')

class Check extends Construct {
  constructor (logicalId, props) {
    super(logicalId)
    this.name = props.name
    this.alertChannels = null // TODO: Just track the alert channel subscriptions...
  }
}

module.exports = Check
