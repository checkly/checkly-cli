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

module.exports = {
  print,
  readLocal,
}
