const YAML = require('yaml')
const consola = require('consola')
const nodegit = require('nodegit')
const table = require('text-table')
const chalk = require('chalk')
const { readFile } = require('fs/promises')
require('console.table')

function print(data, { output } = {}) {
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
    console.log(table(data.map((fields) => Object.values(fields))))
    return
  }

  console.table(data)
}

async function readLocal(path) {
  consola.debug(`Reading local file: ${path}`)
  try {
    const file = await readFile(path, { encoding: 'utf-8' })
    return YAML.parse(file)
  } catch (e) {
    consola.error(e)
    return new Error(e)
  }
}

function printDeployResults(data, flags) {
  const { output, dryRun } = flags
  if (dryRun) {
    data.forEach((entity) => {
      console.log(chalk.blue.bold(entity.type))
      print(
        {
          create: entity.actions.create.map((item) => item.logicalId),
          update: entity.actions.update.map((item) => item.logicalId),
          delete: entity.actions.delete.map((item) => item.logicalId),
        },
        { output }
      )
    })
    return
  }

  data.forEach((entity) => {
    console.log(chalk.blue.bold(entity.type))
    print(
      {
        create: entity.typeResult
          .find((actionItem) => actionItem.action === 'create')
          .results.map((item) => item.logicalId),
        update: entity.typeResult
          .find((actionItem) => actionItem.action === 'update')
          .results.map((item) => item.logicalId),
        delete: entity.typeResult
          .find((actionItem) => actionItem.action === 'delete')
          .results.map((item) => item.logicalId),
      },
      { output }
    )
  })
}

async function getRepoUrl(path, remoteName = 'origin') {
  try {
    const repository = await nodegit.Repository.open(path)
    const remoteObject = await repository.getRemote(remoteName)
    const remoteUrl = await remoteObject.url()
    return remoteUrl
  } catch (error) {
    return path
  }
}

const fs = require('fs')
const path = require('path')

const CHECKLY_DIR_NAME = '.checkly'

let CWD = process.cwd()
let CHECKLY_DIR_PATH = path.join(CWD, CHECKLY_DIR_NAME)
let CHECKS_DIR_PATH = path.join(CWD, CHECKLY_DIR_NAME, 'checks')
let SETTINGS_FILE = path.join(CWD, CHECKLY_DIR_NAME, 'settings.yml')

const hasChecklyDirectory = () => fs.existsSync(CHECKLY_DIR_PATH)
const hasChecksDirectory = () => fs.existsSync(CHECKS_DIR_PATH)
const hasGlobalSettingsFile = () => fs.existsSync(SETTINGS_FILE)

// Loop up parent directories until you find a valid checkly directory
// Just like Git does to find `.git`
function findChecklyDir() {
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
  throw new Error('Checkly directory not found!')
}

function getGlobalSettings() {
  if (!hasGlobalSettingsFile) {
    throw new Error('Missing settings file')
  }

  return fs.readFileSync(SETTINGS_FILE, 'utf8')
}

module.exports = {
  print,
  readLocal,
  printDeployResults,
  getRepoUrl,
  findChecklyDir,
  getGlobalSettings,
}
