/* eslint no-useless-constructor: "off" */
const bundle = require('../../src/parser/bundler')
const Check = require('./Check')

class BrowserCheck extends Check {
  constructor (logicalId, props) {
    super(logicalId, props)
    // TODO: Add a helper for reading this from a file?
    this.script = props.script
    this.entry = props.entry
    // TODO: Add support for `scriptPath` and `dependencies` (requires BE changes).
  }

  async synthesize () {
    let bundled = {}
    if (this.entry) {
      bundled = await bundle(this)
    }
    return {
      ...super.synthesize(),
      checkType: 'BROWSER',
      script: this.script,
      ...bundled,
    }
  }
}

module.exports = BrowserCheck
