const bundle = require('../../src/parser/bundler')
const Check = require('./Check')

class ProgrammableApiCheck extends Check {
  constructor (logicalId, props) {
    super(logicalId, props)
    this.script = props.script
    this.entry = props.entry
  }

  async synthesize () {
    let bundled = {}
    if (this.entry) {
      bundled = await bundle(this)
    }
    return {
      ...super.synthesize(),
      checkType: 'PROGRAMMABLE',
      script: this.script,
      runtimeId: '2022.10',
      ...bundled,
    }
  }
}

module.exports = ProgrammableApiCheck
