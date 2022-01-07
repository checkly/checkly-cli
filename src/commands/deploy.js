const consola = require('consola')
const { prompt } = require('inquirer')
const { Command, flags } = require('@oclif/command')

const { runDeploy } = require('../modules/deploy')
const { force } = require('../services/flags')
const { promptConfirm } = require('../services/prompts')

class DeployCommand extends Command {
  async run () {
    consola.info('Deploying .checkly directory')
    const { flags } = this.parse(DeployCommand)
    const { force, dryRun, preview } = flags

    if (!force) {
      const { confirm } = await prompt([promptConfirm({ message: 'You are about to deploy your project. Do you want to continue?' })])
      if (!confirm) {
        return
      }
    }

    try {
      const { diff } = await runDeploy({ dryRun, preview })

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
