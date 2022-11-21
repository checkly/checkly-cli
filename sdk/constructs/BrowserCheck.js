/* eslint no-useless-constructor: "off" */
const Check = require('./Check')

class BrowserCheck extends Check {
  constructor (logicalId, props) {
    super(logicalId, props)
  }
}

module.exports = BrowserCheck
