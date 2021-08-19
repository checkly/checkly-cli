const consola = require('consola')
const { checks } = require('../../services/api')
const { printDeployResults, readLocal } = require('../../services/utils')
const parser = require('../../parser')

async function deployChecks(flags) {
  const { dryRun } = flags
  try {
    const settings = await readLocal('./.checkly/settings.yml')
    const parseResults = await parser()
    const projectId = settings.project.id

    // DEBUG
    console.log({
      projectId,
      checks: Object.keys(parseResults.checks),
      groups: Object.keys(parseResults.groups),
    })

    const { data } = await checks.deploy(
      { projectId, ...parseResults },
      { dryRun }
    )

    printDeployResults(data, flags)
  } catch (err) {
    consola.error(err)
  }
}

module.exports = deployChecks
