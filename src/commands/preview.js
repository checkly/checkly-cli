const consola = require('consola')
const { Command } = require('@oclif/command')

class PreviewCommand extends Command {
  async run() {
    consola.info('Generating project preview')
    consola.success('Project preview was successfully generated')
  }
}

PreviewCommand.description = ''

module.exports = PreviewCommand
