const { Command, flags } = require('@oclif/command')

const runtimes = require('../modules/runtimes')
const { output } = require('../services/flags')

class RuntimesCommand extends Command {
  static args = [{
    name: 'action',
    required: false,
    description: 'Project action to execute',
    options: ['install', 'remove'],
  }]

  async run () {
    const { args, flags } = this.parse(RuntimesCommand)

    switch (args.action) {
      case 'install':
        return runtimes.install({ ...flags })
      case 'remove':
        return runtimes.remove({ ...flags })
    }
  }
}

RuntimesCommand.description = 'Manage Runtimes Locally'

RuntimesCommand.flags = {
  output,
  runtimeVersion: flags.string({
    char: 'v',
    description: 'runtime version',
    required: true,
  }),
}

module.exports = RuntimesCommand
