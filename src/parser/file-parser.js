const fs = require('fs')
const path = require('path')
const consola = require('consola')

const MAX_NESTING_LEVEL = 1
const SETTINGS = 'settings'
const CHECK = 'check'
const GROUP = 'group'
const YML = '.yml' || '.yaml'

const { findChecklyDir } = require('../services/utils')

function parseChecklyFile (filePath, nestingLevel = 1, prefix = '') {
  const fileStats = fs.lstatSync(filePath)
  const basename = path.basename(filePath)
  const name = `${prefix}${basename}`
  const ext = path.extname(filePath)

  const file =
    basename === `${SETTINGS}${YML}`
      ? {
          filePath,
          type: SETTINGS
        }
      : {
          name,
          filePath,
          type: CHECK,
          error: ext !== YML ? 'InvalidFileExtension' : null
        }

  if (fileStats.isDirectory()) {
    if (nestingLevel <= MAX_NESTING_LEVEL) {
      nestingLevel += 1
      file.checks = fs
        .readdirSync(filePath)
        .map((f) =>
          parseChecklyFile(`${filePath}/${f}`, nestingLevel, name + '/')
        )
      file.type = GROUP
      file.error = null
    } else {
      file.error = 'InvalidNestingLevel'
    }
  }

  return file
}

function parseChecklySettings (files) {
  return files.map((file) => {
    if (file.type === GROUP) {
      const settingsIndex = file.checks.findIndex((c) => c.type === 'settings')
      if (settingsIndex !== -1) {
        file.settings = file.checks[settingsIndex].filePath
        file.checks.splice(settingsIndex, 1)
        delete file.settings.type
      }
    }
    return file
  })
}

function parseChecklyDirectory () {
  const checksDir = path.join(findChecklyDir(), 'checks')

  try {
    const checksDirStats = fs.lstatSync(checksDir)

    if (!checksDirStats.isDirectory()) {
      throw new Error('Missing checks directory')
    }

    const files = fs.readdirSync(checksDir)
    const parsedFiles = files.map((file) =>
      parseChecklyFile(path.join(checksDir, file))
    )
    return parseChecklySettings(parsedFiles)
  } catch (err) {
    consola.error(err)
    throw err
  }
}

module.exports = {
  CHECK,
  GROUP,
  parseChecklyDirectory
}
