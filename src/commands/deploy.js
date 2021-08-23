const consola = require('consola')
const { Command, flags } = require('@oclif/command')
const { output } = require('../services/flags')

const parser = require('../parser')
const { checks } = require('../services/api')
const { printDeployResults, readLocal } = require('../services/utils')

class DeployCommand extends Command {
  async run() {
    consola.info('Deploying ./.checkly directory')
    const { flags } = this.parse(DeployCommand)
    const { dryRun } = flags

    try {
      const settings = await readLocal('./.checkly/settings.yml')
      const parseResults = await parser()
      const projectId = settings.project.id

      consola.debug('Keys of objects sent to API:')
      consola.debug({
        projectId,
        checks: Object.keys(parseResults.checks),
        groups: Object.keys(parseResults.groups),
      })

      consola.debug(JSON.stringify(parseResults, null, 2))

      const { data } = await checks.deploy(
        { projectId, ...parseResults },
        { dryRun }
      )

      printDeployResults(data, flags)
    } catch (err) {
      consola.error(err)
    }
  }
}

DeployCommand.description = 'Deploy and sync your ./checkly directory'

DeployCommand.flags = {
  output,
  dryRun: flags.boolean({
    char: 'x',
    default: false,
    description: 'Do not actually write any changes',
  }),
}

module.exports = DeployCommand
