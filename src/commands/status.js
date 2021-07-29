const { Command, flags } = require('@oclif/command')
const checkStatuses = require('../modules/check_statuses')
const config = require('../services/config')

const defaultOutput = config.get('output')

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
  output: flags.string({
    char: 'o',
    description: 'output type',
    default: defaultOutput,
    options: ['text', 'json'],
  }),
}

module.exports = StatusCommand
