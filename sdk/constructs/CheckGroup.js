const Construct = require('./Construct')

class CheckGroup extends Construct {
  constructor (logicalId, props) {
    super(logicalId)
    this.name = props.name
    this.activated = props.activated
    this.muted = props.muted
    this.tags = props.tags
    this.locations = props.locations
    this.checks = props.checks ?? []
    this.checks.forEach(check => {
      check.groupId = { ref: logicalId }
    })
    // TODO: Add additional fields
  }

  synthesize () {
    return {
      name: this.name,
      activated: this.activated,
      muted: this.muted,
      tags: this.tags,
      locations: this.locations,
    }
  }
}

module.exports = CheckGroup
