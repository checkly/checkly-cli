const consola = require('consola')
const { Command } = require('@oclif/command')
const config = require('../services/config')

class LogoutCommand extends Command {
  async run() {
    config.data.clear()
    config.auth.clear()
    consola.success('See you soon! 👋')
  }
}

LogoutCommand.description = 'Logout and clear local conf'

module.exports = LogoutCommand
