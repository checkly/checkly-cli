const { Command } = require('@oclif/command')
const consola = require('consola')
const config = require('./../services/config')

class WhoamiCommand extends Command {
  async run() {
    const accountId = config.data.get('accountId')
    const accountName = config.data.get('accountName')
    return consola.log('Account:', accountName, 'ID:', accountId)
  }
}

WhoamiCommand.description = 'See your logged account and user'

module.exports = WhoamiCommand
