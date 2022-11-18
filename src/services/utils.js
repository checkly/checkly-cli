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
let SETTINGS_FILE = path.join(CWD, CHECKLY_DIR_NAME, 'settings.yml')
const CHECKLY_CONFIG_FILE = path.join(CWD, 'checkly.config.js')

const hasChecklyDirectory = () => fs.existsSync(CHECKLY_DIR_PATH)
const hasGlobalSettingsFile = () => fs.existsSync(SETTINGS_FILE)
const hasChecklyConfigFile = () => fs.existsSync(CHECKLY_CONFIG_FILE)

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

function getLocationsOutput (locations) {
  if (!locations) {
    return ''
  }

  locations.sort()
  return locations?.length > 3 ? `${locations.slice(0, 3).join(', ')} + ${locations.length - 3} more` : locations.join(', ')
}

// Loop up parent directories until you find a valid checkly directory
// Just like Git does to find `.git`
function findChecklyDir () {
  while (CWD !== '/') {
    if (
      hasChecklyDirectory() &&
      hasGlobalSettingsFile()
    ) {
      return CHECKLY_DIR_PATH
    }

    CWD = path.resolve(CWD, '..')
    CHECKLY_DIR_PATH = path.join(CWD, CHECKLY_DIR_NAME)
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

function getChecklyConfigPath () {
  if (!hasChecklyConfigFile) {
    throw new Error('Missing config file')
  }

  return CHECKLY_CONFIG_FILE
}

function isFunction (symbol) {
  return symbol !== null &&
   typeof variable === 'function'
}

function isObject (symbol) {
  return symbol !== null &&
   Object.prototype.toString.call(symbol) === '[object Object]'
}

module.exports = {
  isFunction,
  isObject,
  print,
  readLocal,
  getRepoUrl,
  findChecklyDir,
  getGlobalSettings,
  getLocationsOutput,
  getChecklyConfigPath,
}
