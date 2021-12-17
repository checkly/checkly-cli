const consola = require('consola')
const path = require('path')
const { Command, flags } = require('@oclif/command')
const { output } = require('../services/flags')

const parser = require('../parser')
const { checks } = require('../services/api')
const { findChecklyDir, print, readLocal } = require('../services/utils')

class DeployCommand extends Command {
  async run() {
    consola.info('Deploying .checkly directory')
    const { flags } = this.parse(DeployCommand)
    const { dryRun } = flags

    try {
      const parseResults = await parser()
      const settings = await readLocal(
        path.join(findChecklyDir(), 'settings.yml')
      )
      const projectId = settings.projectId

      consola.debug('Keys of objects sent to API:')
      consola.debug({
        projectId,
        checks: Object.keys(parseResults.checks),
        groups: Object.keys(parseResults.groups),
      })

      const { data } = await checks.deploy(
        { projectId, ...parseResults },
        { dryRun }
      )

      print(data, flags)
    } catch (err) {
      consola.error(err)
      throw err
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
