const fs = require('fs')
const path = require('path')

const CHECKLY_DIR_NAME = './.checkly'

const CWD = process.cwd()
const CHECKLY_DIR_PATH = path.join(CWD, CHECKLY_DIR_NAME)
const CHECKS_DIR_PATH = path.join(CWD, CHECKLY_DIR_NAME, '/checks')
const SETTINGS_FILE = path.join(CWD, CHECKLY_DIR_NAME, '/settings.yml')

const hasChecklyDirectory = () => fs.existsSync(CHECKLY_DIR_PATH)
const hasChecksDirectory = () => fs.existsSync(CHECKS_DIR_PATH)
const hasGlobalSettingsFile = () => fs.existsSync(SETTINGS_FILE)
const isProjectValid = () =>
  hasChecklyDirectory() && hasChecksDirectory() && hasGlobalSettingsFile()

function getGlobalSettings() {
  if (!hasGlobalSettingsFile) {
    throw new Error('Missing settings file')
  }

  return fs.readFileSync(SETTINGS_FILE, 'utf8')
}

module.exports = {
  CWD,
  CHECKLY_DIR_PATH,
  CHECKS_DIR_PATH,
  SETTINGS_FILE,
  hasChecklyDirectory,
  hasChecksDirectory,
  hasGlobalSettingsFile,
  isProjectValid,
  getGlobalSettings,
}
