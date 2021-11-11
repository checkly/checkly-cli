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
  const checksDir = path.join(findChecklyDir(), 'alert-channels')

  try {
    const checksDirStats = fs.lstatSync(checksDir)

    if (!checksDirStats.isDirectory()) {
      throw new Error('Missing alert-channels directory')
    }

    const files = fs.readdirSync(checksDir)
    return files.map(
      (file) => console.log(file)
      // parseChecklyFile(path.join(checksDir, file))
    )
  } catch (err) {
    throw new Error(err.message)
  }
}

module.exports = {
  parseAlertsDirectory,
}

parseAlertsDirectory()
