const YAML = require('yaml')
const consola = require('consola')
const gitRemoteOriginUrl = require('git-remote-origin-url')
const table = require('text-table')
const fs = require('fs')
const path = require('path')
const { readFile } = require('fs/promises')
require('console.table')

const CHECKLY_DIR_NAME = '.checkly'

let CWD = process.cwd()
let CHECKLY_DIR_PATH = path.join(CWD, CHECKLY_DIR_NAME)
let CHECKS_DIR_PATH = path.join(CWD, CHECKLY_DIR_NAME, 'checks')
let SETTINGS_FILE = path.join(CWD, CHECKLY_DIR_NAME, 'settings.yml')

const hasChecklyDirectory = () => fs.existsSync(CHECKLY_DIR_PATH)
const hasChecksDirectory = () => fs.existsSync(CHECKS_DIR_PATH)
const hasGlobalSettingsFile = () => fs.existsSync(SETTINGS_FILE)

function print (data, { output } = {}) {
  if (!data && !data.length) {
    consola.warn('No resources found')
    return
  }

  if (output === 'json') {
    consola.log(JSON.stringify(data, null, 2))
    return
  }

  process.stdout.write('\n')

  if (output === 'plain') {
    const tableData = Array.isArray(data) ? data : [data]
    console.log(table(tableData.map((fields) => Object.values(fields))))
    return
  }

  console.table(data)
}

async function readLocal (path) {
  consola.debug(`Reading local file: ${path}`)
  try {
    const file = await readFile(path, { encoding: 'utf-8' })
    return YAML.parse(file)
  } catch (e) {
    consola.error(e)
    return new Error(e)
  }
}

async function getRepoUrl (cwd, remote = 'origin') {
  try {
    return await gitRemoteOriginUrl(cwd, remote)
  } catch (e) {
    return cwd
  }
}

// Loop up parent directories until you find a valid checkly directory
// Just like Git does to find `.git`
function findChecklyDir () {
  while (CWD !== '/') {
    if (
      hasChecklyDirectory() &&
      hasChecksDirectory() &&
      hasGlobalSettingsFile()
    ) {
      return CHECKLY_DIR_PATH
    }

    CWD = path.resolve(CWD, '..')
    CHECKLY_DIR_PATH = path.join(CWD, CHECKLY_DIR_NAME)
    CHECKS_DIR_PATH = path.join(CWD, CHECKLY_DIR_NAME, 'checks')
    SETTINGS_FILE = path.join(CWD, CHECKLY_DIR_NAME, 'settings.yml')
  }
  throw new Error('Directories missing, please see [docs](https://docs.com)')
}

function getGlobalSettings () {
  if (!hasGlobalSettingsFile) {
    throw new Error('Missing settings file')
  }

  return fs.readFileSync(SETTINGS_FILE, 'utf8')
}

module.exports = {
  print,
  readLocal,
  getRepoUrl,
  findChecklyDir,
  getGlobalSettings
}
