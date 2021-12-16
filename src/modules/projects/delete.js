const consola = require('consola')
const { projects } = require('../../services/api')

async function deleteProject({ projectId }) {
  try {
    if (!projectId) {
      throw new Error('Project ID required!')
    }

    await projects.delete(projectId)

    consola.success(` Project ${projectId} deleted \n`)
  } catch (err) {
    consola.error(err)
    throw err
  }
}

module.exports = deleteProject
