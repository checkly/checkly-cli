const { Command } = require('@oclif/command')

const { output } = require('../services/flags')
const { action } = require('../services/args')
const checkStatuses = require('../modules/check-statuses')

class StatusCommand extends Command {
  static args = [action]

  async run () {
    const { flags } = this.parse(StatusCommand)
    return checkStatuses.info({ ...flags })
  }
}

StatusCommand.description = 'Status dashboard'
StatusCommand.flags = { output }

module.exports = StatusCommand
