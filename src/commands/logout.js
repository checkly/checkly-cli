const consola = require('consola')
const { prompt } = require('inquirer')
const { Command } = require('@oclif/command')

const config = require('../services/config')
const { force } = require('./../services/flags')
const { promptConfirm } = require('./../services/prompts')

class LogoutCommand extends Command {
  async run () {
    const { flags } = this.parse(LogoutCommand)
    const { force } = flags

    if (!force) {
      const message = `You are about to clear your local session of
        \`${config.data.get('accountName')}\`, do you want to continue?`

      const { confirm } = await prompt([promptConfirm({ message })])

      if (!confirm) {
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
