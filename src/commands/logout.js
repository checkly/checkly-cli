const consola = require('consola')
const { prompt } = require('inquirer')
const { Command } = require('@oclif/command')

const config = require('../services/config')
const { force } = require('./../services/flags')

class LogoutCommand extends Command {
  async run () {
    const { flags } = this.parse(LogoutCommand)
    const { force } = flags

    if (!force) {
      const { confirmLogout } = await prompt([
        {
          name: 'confirmLogout',
          type: 'confirm',
          message: `You are about to clear your local session of \`${config.data.get(
            'accountName'
          )}\`, do you want to continue?`
        }
      ])

      if (!confirmLogout) {
        this.exit(0)
      }
    }

    config.clear()
    consola.success('See you soon! 👋')

    this.exit(0)
  }
}

LogoutCommand.description = 'Logout and clear local conf'

LogoutCommand.flags = {
  force
}

module.exports = LogoutCommand
