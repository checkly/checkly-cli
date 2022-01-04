const { Command } = require('@oclif/command')

const groups = require('../modules/groups')
const { output } = require('../services/flags')
const { action, id } = require('../services/args')
const { ACTIONS } = require('../services/constants')

class GroupsCommand extends Command {
  static args = [action, id]

  async run () {
    const { args, flags } = this.parse(GroupsCommand)

    switch (args.action) {
      case ACTIONS.INFO:
        return groups.info(args.id, { ...flags })
      default:
        return groups.list({ ...flags })
    }
  }
}

GroupsCommand.description = 'Manage Groups'

GroupsCommand.flags = {
  output
}

module.exports = GroupsCommand
