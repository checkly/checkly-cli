const { Command } = require('@oclif/command')

const accounts = require('./../modules/accounts')
const { output } = require('./../services/flags')
const { action } = require('../services/args')

class AccountsCommand extends Command {
  static args = [action]

  async run () {
    const { args, flags } = this.parse(AccountsCommand)

    switch (args.action) {
      default:
        accounts.list({ ...flags })
    }
  }
}

AccountsCommand.description = 'Manage accounts'

AccountsCommand.flags = {
  output
}

module.exports = AccountsCommand
