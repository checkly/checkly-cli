const consola = require('consola')
const { checks } = require('../../services/api')

const { print } = require('../../services/utils')

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
        activated
      })
    )

    print(allChecks, { output })
  } catch (err) {
    consola.error(err)
  }
}

module.exports = listChecks
