const consola = require('consola')
const { cli } = require('cli-ux')

function print(data, { output = 'text', format = 'table', type = 'info' }) {
  if (output === 'json') {
    consola.log(JSON.stringify(data, null, 2))
    return
  }

  process.stdout.write('\n')

  if (format === 'table') {
    cli.table(data, {
      id: { header: 'ID' },
      name: {},
      checkType: { header: 'Check Type' },
      frequency: {},
      locations: {
        get: (row) => row.locations.join(','),
      },
      activated: {
        get: (row) => (row.activated === true ? '✅' : '❌'),
      },
    })
    return
  }

  if (format === 'text') {
    consola.log(
      data.map((fields) => Object.values(fields).join(', ')).join('\n')
    )
    return
  }

  consola[type](data)
}

module.exports = {
  print,
}
