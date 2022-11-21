const Construct = require('./Construct')

// This is an abstract class and should not be used directly
class AlertChannel extends Construct {
  constructor (logicalId, props) {
    super(logicalId)
  }

  synthesize () {
    return {}
  }
}

module.exports = AlertChannel
