const consola = require('consola')
const YAML = require('yaml')
const { checks } = require('../../services/api')
const { print } = require('../../services/utils')

async function checkResults() {
  try {
    const rawChecks = await checks.getAllLocal(checkName)
    const parsedChecks = rawChecks.map((rawCheck) => YAML.parse(rawCheck))
    const selectedCheck = parsedChecks.filter(
      (check) => check.name === checkName
    )
    const results = await checks.run(selectedCheck)
    if (results.status === 202) {
      print(' Check successfully submitted')
    }
  } catch (err) {
    consola.error(err)
  }
}

module.exports = checkResults
