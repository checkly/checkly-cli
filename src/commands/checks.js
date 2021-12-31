const { Command } = require('@oclif/command')

const checks = require('../modules/checks')
const { output } = require('../services/flags')
const { action, id } = require('../services/args')
const { ACTIONS } = require('../services/constants')

class ChecksCommand extends Command {
  static args = [action, id]

  async run () {
    const { args, flags } = this.parse(ChecksCommand)

    switch (args.action) {
      case ACTIONS.INFO:
        return checks.info(args.id, { ...flags })
      default:
        return checks.list({ ...flags })
    }
  }
}

ChecksCommand.description = 'Manage Checks'

ChecksCommand.flags = {
  output
}

module.exports = ChecksCommand
