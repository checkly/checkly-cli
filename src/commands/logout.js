const consola = require('consola')
const { Command } = require('@oclif/command')
const config = require('../services/config')

class Logout extends Command {
  async run() {
    config.clear()
    consola.success('See you soon! 👋')
  }
}

Logout.description = 'Logout and clear local conf'

module.exports = Logout
