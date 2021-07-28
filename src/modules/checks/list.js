const consola = require('consola')
const { cli } = require('cli-ux')
const { checks } = require('../../services/api')

async function listChecks({ output } = {}) {
  try {
    const res = await checks.getAll()

    const allChecks = res.data.map(
      ({ id, name, checkType, frequency, locations, activated }) => ({
        id,
        name,
        checkType,
        frequency,
        locations,
        activated,
      })
    )

    switch (output) {
      case 'json':
        consola.log(JSON.stringify(allChecks, null, 2))
        break
      case 'table':
        cli.table(allChecks, {
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
        break
      case 'text':
        consola.log(
          allChecks.map((fields) => Object.values(fields).join(', ')).join('\n')
        )
        break
      default:
        consola.log(`Unknown output format: ${output}`)
        break
    }
  } catch (err) {
    consola.error(err)
  }
}

module.exports = listChecks
