const consola = require('consola')
const { checks } = require('../../services/api')
const { print } = require('../../services/utils')

async function apiCheck ({ check, location }) {
  try {
    const apiCheck = {
      ...check,
      runLocation: location
    }

    const { data } = await checks.run(apiCheck)
    print(data)
  } catch (err) {
    consola.error(err)
    throw err
  }
}

module.exports = apiCheck
