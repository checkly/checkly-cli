const consola = require('consola')
const { Command } = require('@oclif/command')
const config = require('../services/config')

class PreviewCommand extends Command {
  async run() {}
}

PreviewCommand.description = ''

module.exports = PreviewCommand
