const consola = require('consola')
const { Command, flags } = require('@oclif/command')

const { print } = require('../services/utils')
const { output } = require('../services/flags')
const { runDeploy } = require('../modules/deploy')

class DeployCommand extends Command {
  async run () {
    consola.info('Deploying .checkly directory')
    const { flags } = this.parse(DeployCommand)
    const { dryRun } = flags

    try {
      const data = await runDeploy(dryRun)
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
    description: 'Do not actually write any changes'
  })
}

module.exports = DeployCommand
