const {
  getChecklyConfigPath,
} = require('../services/utils')
const { Project } = require('../../sdk/constructs')

async function getConfigOutput () {
  const exported = require(getChecklyConfigPath())
  // TODO: Allow for `exported` to be a function (or even an async function?)
  if (!(exported instanceof Project)) {
    throw new Error(`Unsupported config export type: ${typeof exported}. Please export a Project.`)
  }
  return exported.synthesize()
}

async function parseChecklyConfig () {
  // TODO: Validate here that it is a Project object
  const result = await getConfigOutput()
  return result
}

module.exports = {
  parseChecklyConfig,
}
