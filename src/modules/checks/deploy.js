const consola = require('consola')
const { checks } = require('../../services/api')
const { print, readLocal } = require('../../services/utils')
const parser = require('../../parser')

async function deployChecks(id, { output } = {}) {
  try {
    const settings = await readLocal('./.checkly/settings.yml')
    const parsedChecks = parser()
    const projectId = settings.project.id

    const { data } = await checks.deploy({ projectId, ...parsedChecks })
    print(data, { output })
  } catch (err) {
    consola.error(err)
  }
}

module.exports = deployChecks
