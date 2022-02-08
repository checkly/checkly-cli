const path = require('path')
const consola = require('consola')
const { prompt } = require('inquirer')

const parser = require('./../../parser')
const { projects } = require('./../../services/api')
const { promptConfirm } = require('./../../services/prompts')
const { readLocal, findChecklyDir } = require('./../../services/utils')

const runDeploy = async ({ dryRun, preview, force }) => {
  const parseResults = await parser()
  const settings = await readLocal(path.join(findChecklyDir(), 'settings.yml'))
  const projectId = settings.projectId

  preview && console.log(JSON.stringify(parseResults, null, 2))

  if (!force) {
    const { confirm } = await prompt([promptConfirm({ message: 'You are about to deploy your project. Do you want to continue?' })])
    if (!confirm) {
      return
    }
  }

  const { data } = await projects.deploy(
    { projectId, ...parseResults },
    { dryRun }
  )

  consola.log(JSON.stringify(data, null, 2))

  return data
}

module.exports = runDeploy
