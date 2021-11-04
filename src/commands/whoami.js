const { Command } = require('@oclif/command')
const config = require('./../services/config')
const { output } = require('./../services/flags')
const { print } = require('./../services/utils')

class WhoamiCommand extends Command {
  async run() {
    const { flags } = this.parse(WhoamiCommand)
    print(
      {
        accountId: config.data.get('accountId'),
        accountName: config.data.get('accountName'),
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
