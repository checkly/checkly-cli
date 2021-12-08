const consola = require('consola')
const { projects } = require('../../services/api')

const { print } = require('../../services/utils')

async function deleteProject({ projectId, output = 'text' }) {
  try {
    if (!projectId) {
      throw new Error('Project ID required!')
    }

    await projects.delete(projectId)

    print(`Delete project ${projectId} success!`, { output })
  } catch (err) {
    consola.error(err)
  }
}

module.exports = deleteProject
