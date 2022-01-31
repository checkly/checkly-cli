const { Command } = require('@oclif/command')

const link = require('../modules/link')
const { id } = require('./../services/args')
const { force } = require('./../services/flags')

class LinkCommand extends Command {
  static args = [
    {
      ...id,
      description: 'Specify the projectId'
    }
  ]

  async run () {
    const { flags, args } = this.parse(LinkCommand)
    const { force } = flags

    link({ force, projectId: args.id })
  }
}

LinkCommand.description = 'Link your checkly directory with an existing project'

LinkCommand.flags = {
  force
}

module.exports = LinkCommand
