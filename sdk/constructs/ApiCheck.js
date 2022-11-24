/* eslint no-useless-constructor: "off" */
const Check = require('./Check')

class ApiCheck extends Check {
  constructor (logicalId, props) {
    super(logicalId, props)
    this.request = props.request
  }

  async synthesize () {
    return {
      ...super.synthesize(),
      checkType: 'API',
      request: this.request,
    }
  }
}

module.exports = ApiCheck
