const {
  getChecklyConfigPath,
  isFunction,
} = require('../services/utils')
const { Project } = require('../../sdk/constructs')

async function getConfigOutput () {
  const exported = require(getChecklyConfigPath())
  let finalExport = exported
  if (isFunction(finalExport)) {
    finalExport = finalExport()
  }
  // In case it is a Promise
  finalExport = await finalExport
  if (!(finalExport instanceof Project)) {
    throw new Error(`Unsupported config export type: ${typeof finalExport}. Please export a Project.`)
  }
  return finalExport.synthesize()
}

async function parseChecklyConfig () {
  // TODO: Validate here that it is a Project object
  const result = await getConfigOutput()
  return result
}

module.exports = {
  parseChecklyConfig,
}
