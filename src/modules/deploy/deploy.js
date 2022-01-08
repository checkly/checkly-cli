const parser = require('../../parser')
const { readLocal, findChecklyDir } = require('../../services/utils')
const path = require('path')
const { projects } = require('../../services/api')

const runDeploy = async ({ dryRun, preview }) => {
  const parseResults = await parser()
  const settings = await readLocal(path.join(findChecklyDir(), 'settings.yml'))
  const projectId = settings.projectId

  preview && console.log(JSON.stringify(parseResults, null, 2))

  const { data } = await projects.deploy(
    { projectId, ...parseResults },
    { dryRun }
  )
  return data
}

module.exports = runDeploy
