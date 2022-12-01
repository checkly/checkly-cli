const path = require('path')
const consola = require('consola')
const { prompt } = require('inquirer')

const { parseChecklyResources } = require('./../../parser/resource-parser')
const parser = require('./../../parser')
const { projects } = require('./../../services/api')
const { promptConfirm } = require('./../../services/prompts')

const tryPackageParser = async () => {
  const packageJsonPath = path.join(process.cwd(), 'package.json')
  try {
    const packageJson = require(packageJsonPath)
    const checklyConf = packageJson.checkly
    if (!checklyConf) {
      return null
    }
    if (!checklyConf.projectName) {
      return null
    }

    const rootFolder = checklyConf.projectPath ? path.join(process.cwd(), checklyConf.projectPath) : process.cwd()

    return parseChecklyResources(checklyConf.projectName, rootFolder)
  } catch (err) {
    return null
  }
}

const runDeploy = async ({ dryRun, preview, force }) => {
  const parseResults = await tryPackageParser() || await parser()

  preview && console.log(JSON.stringify(parseResults, null, 2))

  if (!force) {
    const { confirm } = await prompt([promptConfirm({ message: 'You are about to deploy your project. Do you want to continue?' })])
    if (!confirm) {
      return
    }
  }

  try {
    const { data } = await projects.deploy(
      { ...parseResults },
      { dryRun },
    )
    consola.log(JSON.stringify(data, null, 2))
    return data
  } catch (err) {
    console.log('GOT ERR ', err)
  }
}

module.exports = runDeploy
