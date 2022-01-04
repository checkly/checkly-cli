const consola = require('consola')
const { Command, flags } = require('@oclif/command')

const { output } = require('../services/flags')
const { runDeploy } = require('../modules/deploy')

class DeployCommand extends Command {
  async run () {
    consola.info('Deploying .checkly directory')
    const { flags } = this.parse(DeployCommand)
    const { dryRun } = flags

    try {
      const { diff } = await runDeploy(dryRun)

      // TODO: force JSON format until we made a smarter print method
      consola.log(JSON.stringify(diff, null, 2))
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
