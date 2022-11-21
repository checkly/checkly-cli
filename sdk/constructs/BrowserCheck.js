/* eslint no-useless-constructor: "off" */
const Check = require('./Check')

class BrowserCheck extends Check {
  constructor (logicalId, props) {
    super(logicalId, props)
    // TODO: Add a helper for reading this from a file?
    this.script = props.script
    // TODO: Add support for `scriptPath` and `dependencies` (requires BE changes).
  }

  synthesize () {
    return {
      ...super.synthesize(),
      checkType: 'BROWSER',
      script: this.script,
    }
  }
}

module.exports = BrowserCheck
