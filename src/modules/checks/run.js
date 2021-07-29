const consola = require('consola')
const YAML = require('yaml')
const { checks } = require('../../services/api')

async function runCheck(checkName = '') {
  try {
    const rawChecks = await checks.getAllLocal()
    const parsedChecks = rawChecks.map((rawCheck) => YAML.parse(rawCheck))
    const selectedCheck = parsedChecks.filter(
      (check) => check.name === checkName
    )
    const results = await checks.run(selectedCheck)
    if (results.status === 202) {
      consola.success(' Check successfully submitted')
    }
  } catch (err) {
    consola.error(err)
  }
}

module.exports = runCheck
