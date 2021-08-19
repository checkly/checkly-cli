const consola = require('consola')
const { readFile } = require('fs/promises')
const table = require('text-table')
const YAML = require('yaml')
require('console.table')

function print(data, { output } = {}) {
  if (!data) {
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
      console.log(entity.type)
      print(
        {
          create: entity.actions.create.map((item) => item.logicalId),
          update: entity.actions.update.map((item) => item.logicalId),
          delete: entity.actions.delete.map((item) => item.logicalId),
        },
        { output }
      )
    })
  } else {
    data.forEach((entity) => {
      console.log(entity.type)
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
}

module.exports = {
  print,
  readLocal,
  printDeployResults,
}
