const consola = require('consola')
require('console.table')

function print(data, { output = 'text', format = 'table', type = 'info' }) {
  if (output === 'json') {
    process.stdout.write(JSON.stringify(data, null, 2))
    return
  }

  process.stdout.write('\n')

  if (format === 'table') {
    console.table(data)
    return
  }

  consola[type](data)
}

module.exports = {
  print
}
