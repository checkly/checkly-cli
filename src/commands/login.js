const consola = require('consola')
const { Command } = require('@oclif/command')

const raccoon = require('../services/raccoon')
const config = require('../services/config')

class LoginCommand extends Command {
  static args = [
    {
      name: 'apiKey',
      required: true,
      description:
        'Checkly API Key. \nIf you did not have one, create it at: https://app.checklyhq.com/account/api-keys',
    },
  ]

  async run() {
    const { args } = this.parse(LoginCommand)
    process.stdout.write(raccoon)
    config.set('apiKey', args.apiKey)
    config.set('isInitialized', 'true')
    consola.success('Welcome to checkly cli 🦝')
  }
}

LoginCommand.description = 'Login with a Checkly API Key [WIP]'

module.exports = LoginCommand
