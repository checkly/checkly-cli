const { Command } = require('@oclif/command')
const groups = require('../modules/groups')
const { output } = require('../services/flags')

class GroupsCommand extends Command {
  static args = [
    {
      name: 'action',
      required: true,
      description: 'Specify the type of group action to run',
      default: 'list',
      options: ['list', 'info'],
    },
    {
      name: 'id',
      required: false,
      description: 'Specify the groupId',
    },
  ]

  async run() {
    const { args, flags } = this.parse(GroupsCommand)

    switch (args.action) {
      case 'run':
        return groups.run(args.id, { ...flags })
      case 'info':
        return groups.info(args.id, { ...flags })
      default:
        return groups.list({ ...flags })
    }
  }
}

GroupsCommand.description = 'Manage Groups'

GroupsCommand.flags = {
  output,
}

module.exports = GroupsCommand
