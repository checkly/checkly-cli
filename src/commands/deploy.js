const consola = require('consola')
const { Command, flags } = require('@oclif/command')

const { runDeploy } = require('../modules/deploy')
const { force } = require('../services/flags')

class DeployCommand extends Command {
  async run () {
    consola.info('Deploying .checkly directory')
    const { flags } = this.parse(DeployCommand)

    try {
      runDeploy({ ...flags })
    } catch (err) {
      consola.error(err)
      throw err
    }
  }
}

DeployCommand.description = 'Deploy and sync your ./checkly directory'

DeployCommand.flags = {
  force,
  preview: flags.boolean({
    char: 'p',
    default: false,
    description: 'Show state preview'
  }),
  dryRun: flags.boolean({
    char: 'x',
    default: false,
    description: 'Do not actually write any changes'
  })
}

module.exports = DeployCommand
