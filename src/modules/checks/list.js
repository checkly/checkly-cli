const consola = require('consola')
const { checks } = require('../../services/api')
const { print } = require('../../services/utils')

async function listChecks ({ output } = {}) {
  try {
    const res = await checks.getAll()

    const allChecks = res.data.map(
      ({ name, checkType, frequency, locations, activated }) => ({
        name,
        checkType,
        frequency,
        locations,
        activated
      })
    )

    print(allChecks, { output })
  } catch (err) {
    consola.error(err)
    throw err
  }
}

module.exports = listChecks
