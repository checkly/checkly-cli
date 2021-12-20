const consola = require('consola')
const { Command } = require('@oclif/command')
const add = require('../modules/add')

const { findChecklyDir } = require('../services/utils')

class AddCommand extends Command {
  static args = [
    {
      name: 'resource',
      required: true,
      description: 'What do you want to create?',
      default: 'check',
      options: ['check', 'group']
    }
  ]

  async run () {
    try {
      const { args } = this.parse(AddCommand)

      const checklyDir = findChecklyDir()
      switch (args.resource) {
        case 'group':
          return add.group(checklyDir)
        case 'check':
          return add.check(checklyDir)
      }
    } catch (e) {
      consola.error('Checkly directory error -', e)
      return process.exit(1)
    }
  }
}

AddCommand.description = 'Add a new group or check file'

module.exports = AddCommand
