const consola = require('consola')
const { groups } = require('../../services/api')
const { print } = require('../../services/utils')

async function listGroups ({ output } = {}) {
  try {
    const res = await groups.getAll()

    const allGroups = res.data.map(
      ({ id, name, concurrency, activated, muted, locations }) => ({
        id,
        name,
        concurrency,
        activated,
        muted,
        locations: locations?.length > 3 ? `${locations.slice(0, 3).join(', ')} + ${locations.length - 3} more` : locations.join(', ')
      })
    )

    print(allGroups, { output })
  } catch (err) {
    consola.error(err)
    throw err
  }
}

module.exports = listGroups
