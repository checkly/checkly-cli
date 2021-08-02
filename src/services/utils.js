const consola = require('consola')
const table = require('text-table')
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

module.exports = {
  print,
}
