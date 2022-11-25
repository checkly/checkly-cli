/* eslint no-useless-constructor: "off" */
class EnvironmentVariable {
  constructor (props) {
    this.key = props.key
    this.value = props.value
    this.locked = props.locked
  }
}

module.exports = EnvironmentVariable
