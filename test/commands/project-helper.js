const { projects } = require('../../src/services/api')
const config = require('../../src/services/config')
const consola = require('consola')

let project = null

async function getOrCreateProject(projectName, repoUrl) {
  if (project) {
    consola.info(`using existing project id ${project.id}`)
    return project
  }

  const allProjects = await projects.getAll()
  const existingProject = allProjects.data.find((x) => x.name === projectName)
  if (existingProject) {
    consola.info(`using existing project id ${project.id}`)
    project = existingProject
    return existingProject
  }

  try {
    const { data } = await projects.create({
      accountId: config.getAccountId(),
      name: projectName,
      repoUrl: repoUrl,
      activated: true,
      muted: false,
      state: {},
    })
    project = data
    consola.info(`created new project id ${project.id}`)
    return data
  } catch (e) {
    consola.error('Failed to create project - please try again.')
    throw new Error(e)
  }
}

module.exports = getOrCreateProject
