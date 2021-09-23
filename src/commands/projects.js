const { Command, flags } = require('@oclif/command')
const projects = require('../modules/projects')
const config = require('../services/config')

const defaultOutput = config.data.get('output')

class ProjectsCommand extends Command {
  async run() {
    const { args, flags } = this.parse(ProjectsCommand)

    switch (args.action) {
      case 'list':
        return projects.list({ ...flags })
      default:
        return projects.list({ ...flags })
    }
  }
}

ProjectsCommand.description = 'Manage Checks'

ProjectsCommand.flags = {
  output: flags.string({
    char: 'o',
    description: 'output type',
    default: defaultOutput,
    options: ['text', 'json'],
  }),
}

module.exports = ProjectsCommand
