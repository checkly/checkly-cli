const AlertChannel = require('./AlertChannel')

class EmailAlertChannel extends AlertChannel {
  constructor (logicalId, props) {
    super(logicalId, props)
    this.address = props.address
  }

  synthesize () {
    return {
      ...super.synthesize(),
      type: 'EMAIL',
      config: {
        address: this.address,
      },
    }
  }
}

module.exports = EmailAlertChannel
