const fs = require('fs')
const path = require('path')
const YAML = require('yaml')
const consola = require('consola')

const { findChecklyDir } = require('../services/utils')

const { CHECK } = require('./file-parser')
// const { getGlobalSettings } = require('../services/utils')
const bundle = require('./bundler')

const { checkSchema } = require('../schemas/check')
const { groupSchema } = require('../schemas/group')
// const { projectSchema } = require('../schemas/project')

function parseAlertsDirectory() {
  const alertsDir = path.join(findChecklyDir(), 'alert-channels')

  try {
    const alertsDirStats = fs.lstatSync(alertsDir)

    if (!alertsDirStats.isDirectory()) {
      throw new Error('Missing alert-channels directory')
    }

    return fs.readdirSync(alertsDir)
  } catch (err) {
    throw new Error(err.message)
  }
}

module.exports = {
  parseAlertsDirectory,
}
