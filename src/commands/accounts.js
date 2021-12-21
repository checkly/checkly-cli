const { Command } = require('@oclif/command')

const accounts = require('./../modules/accounts')
const { output } = require('./../services/flags')

class AccountsCommand extends Command {
  static args = [
    {
      name: 'action',
      required: true,
      description: 'Specify the type of accounts action to run',
      default: 'list',
      options: ['list']
    }
  ]

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
