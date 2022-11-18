const {
  isFunction,
  isObject,
  getChecklyConfigPath,
} = require('../services/utils')

async function getConfigOutput () {
  const exported = require(getChecklyConfigPath())
  if (isObject(exported)) {
    return exported
  }
  if (isFunction(exported)) {
    return exported()
  }
  throw new Error(`Unsupported config export type: ${typeof exported}`)
}

async function parseChecklyConfig () {
  // TODO: Validate here that it is a Project object
  const result = await getConfigOutput()
  return result
}

module.exports = {
  parseChecklyConfig,
}
