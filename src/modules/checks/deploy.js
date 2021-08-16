const consola = require('consola')
const { checks } = require('../../services/api')
const { print, readLocal } = require('../../services/utils')
const parser = require('../../parser')

async function deployChecks(flags) {
  const { output, dryRun } = flags
  try {
    const settings = await readLocal('./.checkly/settings.yml')
    const parseResults = await parser()
    const projectId = settings.project.id

    // DEBUG
    console.log({
      projectId,
      ...Object.keys(parseResults.checks),
      ...Object.keys(parseResults.groups),
    })

    const { data } = await checks.deploy(
      { projectId, ...parseResults },
      { dryRun }
    )
    print(data, { output })
  } catch (err) {
    consola.error(err)
  }
}

module.exports = deployChecks
