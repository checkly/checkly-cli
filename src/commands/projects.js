const { Command, flags } = require('@oclif/command')
const projects = require('../modules/projects')
const config = require('../services/config')

const defaultOutput = config.data.get('output')

class ProjectsCommand extends Command {
  async run () {
    const { args, flags } = this.parse(ProjectsCommand)

    switch (args.action) {
      case 'create':
        return projects.create({ ...flags })
      case 'list':
        return projects.list({ ...flags })
      case 'delete':
        return projects.del({ ...flags })
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
    options: ['text', 'json']
  }),
  projectId: flags.string({
    char: 'i',
    description: 'project id',
    default: config.getProjectId()
  }),
  name: flags.string({
    char: 'n',
    description: 'project name'
  }),
  repoUrl: flags.string({
    char: 'r',
    description: 'repo url'
  })
}

ProjectsCommand.args = [
  {
    name: 'action',
    required: false,
    description: 'Project action to execute',
    options: ['list', 'delete', 'create']
  }
]

module.exports = ProjectsCommand
