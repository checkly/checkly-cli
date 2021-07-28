const consola = require('consola')
const { checks } = require('../../services/api')
const { print } = require('../../services/utils')

async function infoCheck(id, { output } = {}) {
  try {
    const { data } = await checks.get(id)
    print(data, { output })
  } catch (err) {
    consola.error(err)
  }
}

module.exports = infoCheck
