const { Command, flags } = require('@oclif/command')

const projects = require('../modules/projects')
const { output } = require('../services/flags')
const { ACTIONS } = require('../services/constants')

class ProjectsCommand extends Command {
  static args = [{
    name: 'action',
    required: false,
    description: 'Project action to execute',
    options: [ACTIONS.LIST, ACTIONS.CREATE, ACTIONS.DELETE],
    default: ACTIONS.LIST,
  }]

  async run () {
    const { args, flags } = this.parse(ProjectsCommand)

    switch (args.action) {
      case ACTIONS.CREATE:
        return projects.create({ ...flags })
      case ACTIONS.DELETE:
        return projects.del({ ...flags })
      default:
        return projects.list({ ...flags })
    }
  }
}

ProjectsCommand.description = 'Manage Projects'

ProjectsCommand.flags = {
  output,
  projectId: flags.string({
    char: 'i',
    description: 'project id',
  }),
  name: flags.string({
    char: 'n',
    description: 'project name',
  }),
  repoUrl: flags.string({
    char: 'r',
    description: 'repo url',
  }),
}

module.exports = ProjectsCommand
