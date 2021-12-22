const consola = require('consola')
const { checks } = require('../../services/api')
const { print } = require('../../services/utils')

async function listChecks ({ output } = {}) {
  try {
    const allChecks = {}
    let page = 0
    while (true) {
      const { data, hasMore } = await checks.getAll({ page: page++ })
      data.forEach(check => {
        allChecks[check.id] = check
      })
      if (!hasMore) {
        break
      }
    }

    const pluckedFields = Object.values(allChecks).map(
      ({ name, checkType, frequency, locations, activated }) => ({
        name,
        checkType,
        frequency,
        locations,
        activated
      })
    )

    print(pluckedFields, { output })
  } catch (err) {
    consola.error(err)
    throw err
  }
}

module.exports = listChecks
