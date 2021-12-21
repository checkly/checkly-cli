const fs = require('fs')
const path = require('path')
const consola = require('consola')

const { CHECK, ALERT_CHANNEL, GROUP } = require('./resources')

const MAX_NESTING_LEVEL = 1
const SETTINGS = 'settings'
const YML_EXTENSIONS = ['.yaml', '.yml']
const isYAML = (extension) => YML_EXTENSIONS.includes(extension)
const isFileYAML = (fileName) => isYAML(path.extname(fileName))

const { findChecklyDir } = require('../services/utils')

function parseResourceDirectoy ({ resourceType, fileResolver }) {
  const checksDir = path.join(findChecklyDir(), resourceType)

  try {
    if (!fs.existsSync(checksDir)) {
      return []
    }

    const checksDirStats = fs.lstatSync(checksDir)

    if (!checksDirStats.isDirectory()) {
      throw new Error('Missing checks directory')
    }

    const files = fs.readdirSync(checksDir)
    const parsedFiles = files.map((file) =>
      fileResolver(path.join(checksDir, file))
    )

    return parsedFiles
  } catch (err) {
    consola.error(err)
    throw err
  }
}

function parseChecklyFile (filePath, nestingLevel = 1, prefix = '') {
  const fileStats = fs.lstatSync(filePath)
  const parsed = path.parse(filePath)
  const name = `${prefix}${parsed.base}`
  const ext = path.extname(filePath)

  const file = parsed.name === SETTINGS && isYAML(ext)
    ? {
        filePath,
        type: SETTINGS
      }
    : {
        name,
        filePath,
        type: CHECK.name,
        error: isYAML(ext) ? null : 'InvalidFileExtension'
      }

  if (fileStats.isDirectory()) {
    if (nestingLevel <= MAX_NESTING_LEVEL) {
      nestingLevel += 1
      file.checks = fs
        .readdirSync(filePath)
        .map((f) =>
          parseChecklyFile(`${filePath}/${f}`, nestingLevel, name + '/')
        )
      file.type = GROUP.name
      file.error = null
    } else {
      file.error = 'InvalidNestingLevel'
    }
  }

  return file
}

function parseChecklySettings (files) {
  return files.map((file) => {
    if (file.type === GROUP.name) {
      const settingsIndex = file.checks.findIndex((c) => c.type === SETTINGS)

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
  return parseChecklySettings(
    parseResourceDirectoy({
      resourceType: CHECK.directory,
      fileResolver: parseChecklyFile
    })
  )
}

function parseAlertsFile (filePath, prefix = '') {
  const basename = path.basename(filePath)
  const name = `${prefix}${basename}`
  const ext = path.extname(filePath)

  const file = {
    name,
    filePath,
    type: ALERT_CHANNEL.name,
    error: isYAML(ext) ? null : 'InvalidFileExtension'
  }

  return file
}

function parseAlertChannelsDirectory () {
  try {
    return parseResourceDirectoy({
      resourceType: ALERT_CHANNEL.directory,
      fileResolver: parseAlertsFile
    })
  } catch (err) {}
}

module.exports = {
  isFileYAML,
  parseChecklyDirectory,
  parseAlertChannelsDirectory
}
