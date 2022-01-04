const parser = require('../../parser')
const { readLocal, findChecklyDir } = require('../../services/utils')
const path = require('path')
const consola = require('consola')
const { projects } = require('../../services/api')

const runDeploy = async (dryRun) => {
  const parseResults = await parser()
  const settings = await readLocal(path.join(findChecklyDir(), 'settings.yml'))
  const projectId = settings.projectId

  consola.debug('Keys of objects sent to API:')
  consola.debug({
    projectId,
    checks: Object.keys(parseResults.checks),
    groups: Object.keys(parseResults.groups)
  })

  const { data } = await projects.deploy(
    { projectId, ...parseResults },
    { dryRun }
  )
  return data
}

module.exports = runDeploy
