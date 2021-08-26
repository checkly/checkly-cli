const { Command } = require('@oclif/command')
const checkStatuses = require('../modules/check-statuses')
const { output } = require('../services/flags')

class StatusCommand extends Command {
  static args = [
    {
      name: 'action',
      required: true,
      description: 'Specify the type of checks action to run',
      default: 'info',
    },
  ]

  async run() {
    const { flags } = this.parse(StatusCommand)
    return checkStatuses.info({ ...flags })
  }
}

StatusCommand.description = 'Status dashboard'

StatusCommand.flags = {
  output,
}

module.exports = StatusCommand
