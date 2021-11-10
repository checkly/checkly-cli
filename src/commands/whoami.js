const consola = require('consola')
const { Command } = require('@oclif/command')

const config = require('./../services/config')
const { output } = require('./../services/flags')
const { print } = require('./../services/utils')

class WhoamiCommand extends Command {
  async run() {
    const { flags } = this.parse(WhoamiCommand)

    let accountName = config.data.get('accountName')
    const accountId = config.getAccountId()

    if (process.env.CHECKLY_ACCOUNT_ID) {
      accountName = '-'
      consola.warn(
        "Account ID it's being read from CHECKLY_ACCOUNT_ID env variable"
      )
    }

    print(
      {
        accountId,
        accountName,
      },
      flags
    )
  }
}

WhoamiCommand.description = 'See your logged account and user'

WhoamiCommand.flags = {
  output,
}

module.exports = WhoamiCommand
