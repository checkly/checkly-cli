const consola = require('consola')
const { checks } = require('../../services/api')
const { print } = require('../../services/utils')

async function listChecks ({ output } = {}) {
  try {
    const allChecks = {}
    let page = 1
    while (true) {
      const { data, hasMore } = await checks.getAll({ limit: 100, page: page++ })
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
        activated,
        locations: locations?.length > 3 ? `${locations.slice(0, 3).join(', ')} + ${locations.length - 3} more` : locations.join(', ')
      })
    )

    print(pluckedFields, { output })
  } catch (err) {
    consola.error(err)
    throw err
  }
}

module.exports = listChecks
