const fs = require('fs')
const path = require('path')
const YAML = require('yaml')
const consola = require('consola')
const { prompt } = require('inquirer')

const { projects } = require('./../../services/api')
const { promptConfirm } = require('./../../services/prompts')

const { findChecklyDir, getGlobalSettings } = require('../../services/utils')

async function link ({ projectId, force }) {
  let project

  if (projectId) {
    const { data } = await projects.get(projectId)
    project = data
  } else {
    const { data } = await projects.getAll()
    const { projectKey } = await prompt([
      {
        name: 'projectKey',
        type: 'list',
        choices: data.map(({ id, name }) => `${id} - ${name}`)
      }
    ])

    project = data.find(({ id, name }) => `${id} - ${name}` === projectKey)
  }

  if (!force) {
    const { confirm } = await prompt([
      promptConfirm({
        message: `You are about to link your checkly directory with the project ${project.id}, do you want to continue?`
      })
    ])

    if (!confirm) {
      return
    }
  }

  const dirName = findChecklyDir()

  const settings = YAML.parse(getGlobalSettings())
  settings.projectId = parseInt(project.id)
  settings.projectName = project.name

  fs.writeFileSync(path.join(dirName, 'settings.yml'), YAML.stringify(settings))

  consola.success(`Your local checkly directory is now linked to the project ${project.id}`)
}

module.exports = link
