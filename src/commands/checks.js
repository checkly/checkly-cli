const { Command, flags } = require('@oclif/command')
const checks = require('../modules/checks')
const { output } = require('../services/flags')

class ChecksCommand extends Command {
  static args = [
    {
      name: 'action',
      required: true,
      description: 'Specify the type of checks action to run',
      default: 'list',
      options: ['list', 'info', 'run'],
    },
    {
      name: 'id',
      required: false,
      description: 'Specify the checkId',
    },
  ]

  async run() {
    const { args, flags } = this.parse(ChecksCommand)

    switch (args.action) {
      case 'run':
        return checks.run(args.id, { ...flags })
      case 'info':
        return checks.info(args.id, { ...flags })
      default:
        return checks.list({ ...flags })
    }
  }
}

ChecksCommand.description = 'Manage Checks'

ChecksCommand.flags = {
  output,
  checkName: flags.string({
    char: 'c',
    description: 'Check upon which to execute action',
  }),
}

module.exports = ChecksCommand
