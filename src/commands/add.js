const consola = require('consola')
const { Command } = require('@oclif/command')
const config = require('../services/config')
const add = require('../modules/add')

const files = require('../services/files')

class AddCommand extends Command {
  static args = [
    {
      name: 'resource',
      required: true,
      description: 'What do you want to create?',
      default: 'check',
      options: ['check', 'group'],
    },
  ]

  async run() {
    if (!files.hasChecksDirectory()) {
      consola.error('Checkly project was not initiliazed')
      return process.exit(1)
    }

    const { args } = this.parse(AddCommand)

    switch (args.resource) {
      case 'group':
        return add.group()
      case 'check':
        return add.check()
    }
  }
}

AddCommand.description = 'Add new group or check file'

module.exports = AddCommand
