const { Command, flags } = require('@oclif/command')
const checks = require('../checks')
const config = require('../config')

const defaultOutput = config.get('output')

class ChecksCommand extends Command {
  static args = [
    {
      name: 'action',
      required: true,
      description: 'Specify the type of checks action to run',
      default: 'list',
      options: ['list', 'info', 'create', 'delete', 'update']
    }
  ];

  async run () {
    const { args, flags } = this.parse(ChecksCommand)

    switch (args.action) {
      default:
        return checks.list({ ...flags })
    }
  }
}

ChecksCommand.description = 'Init Checkly CLI'

ChecksCommand.flags = {
  output: flags.string({ char: 'o', description: 'output type', default: defaultOutput, options: ['text', 'json'] })
}

module.exports = ChecksCommand
