const { Command } = require('@oclif/command')
const { accounts } = require('./../services/api')
const { output } = require('./../services/flags')
const { print } = require('./../services/utils')

class WhoamiCommand extends Command {
  async run() {
    const { flags } = this.parse(WhoamiCommand)
    const { data } = await accounts.findMe()
    print(data, flags)
  }
}

WhoamiCommand.description = 'See your logged account and user'

WhoamiCommand.flags = {
  output,
}

module.exports = WhoamiCommand
