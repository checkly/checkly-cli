/* eslint-disable @typescript-eslint/no-var-requires */
const { add } = require('./dep3')

function doesItWork () {
  return add(1, 1) === 2
}

module.exports = { doesItWork }
