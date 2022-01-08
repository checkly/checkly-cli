const consola = require('consola')
const { Command } = require('@oclif/command')

const add = require('../modules/add')
const { findChecklyDir } = require('../services/utils')
const { RESOURCES } = require('../services/constants')

class AddCommand extends Command {
  static args = [
    {
      name: 'resource',
      required: true,
      description: 'What do you want to create?',
      options: [RESOURCES.CHECK, RESOURCES.GROUP, RESOURCES.ALERT_CHANNEL],
      default: RESOURCES.CHECK
    }
  ]

  async run () {
    try {
      const { args } = this.parse(AddCommand)

      const checklyDir = findChecklyDir()
      switch (args.resource) {
        case RESOURCES.GROUP:
          return add.group(checklyDir)
        case RESOURCES.CHECK:
          return add.check(checklyDir)
        case RESOURCES.ALERT_CHANNEL:
          return add.alertChannel(checklyDir)
      }
    } catch (e) {
      consola.error('Checkly directory error -', e)
      return process.exit(1)
    }
  }
}

AddCommand.description = 'Add a new checkly resource'

module.exports = AddCommand
