const { Command, flags } = require('@oclif/command')
const checks = require('../modules/checks')
const config = require('../services/config')

const defaultOutput = config.get('output')

class ChecksCommand extends Command {
  static args = [
    {
      name: 'action',
      required: true,
      description: 'Specify the type of checks action to run',
      default: 'list',
      options: ['list', 'info'],
    },
    {
      name: 'id',
      required: false,
      description: 'Specify the check di',
    },
  ]

  async run() {
    const { args, flags } = this.parse(ChecksCommand)

    switch (args.action) {
      case 'info':
        return checks.info(args.id, { ...flags })
      default:
        return checks.list({ ...flags })
    }
  }
}

ChecksCommand.description = 'Manage Checks'

ChecksCommand.flags = {
  output: flags.string({
    char: 'o',
    description: 'output type',
    default: defaultOutput,
    options: ['text', 'json'],
  }),
}

module.exports = ChecksCommand
