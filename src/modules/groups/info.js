const consola = require('consola')
const { groups } = require('../../services/api')
const { print } = require('../../services/utils')

async function infoGroups(id, { output } = {}) {
  try {
    const { data } = await groups.get(id)
    print(data, { output })
  } catch (err) {
    consola.error(err)
  }
}

module.exports = infoGroups
