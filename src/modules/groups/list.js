const consola = require('consola')
const { groups } = require('../../services/api')
const { print, getLocationsOutput } = require('../../services/utils')

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
        locations: getLocationsOutput(locations)
      })
    )

    print(allGroups, { output })
  } catch (err) {
    consola.error(err)
    throw err
  }
}

module.exports = listGroups
