const consola = require('consola')
const { Command } = require('@oclif/command')

const raccoon = require('../raccoon')
const config = require('../config')

class InitCommand extends Command {
  static args = [
    {
      name: 'apiKey',
      required: true,
      description:
        'Checkly API Key. \nIf you did not have one, create it at: https://app.checklyhq.com/account/api-keys'
    }
  ];

  async run () {
    const { args } = this.parse(InitCommand)
    process.stdout.write(raccoon)
    config.set('apiKey', args.apiKey)
    config.set('isInitialized', 'true')
    consola.success('Welcome to checkly cli 🦝')
  }
}

InitCommand.description = 'Init Checkly CLI'

module.exports = InitCommand
