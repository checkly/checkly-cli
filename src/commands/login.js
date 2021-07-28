const consola = require('consola')
const { Command, flags } = require('@oclif/command')
const { cli } = require('cli-ux')
const chalk = require('chalk')

const raccoon = require('../services/raccoon')
const config = require('../services/config')

const generateMaskedKey = (key) => {
  const maskedKey = key.replace(/[a-zA-Z0-9]/g, '*').slice(0, key.length - 4)
  const lastFourDigitsKey = key.slice(-4)
  return `${maskedKey}${lastFourDigitsKey}`
}

class LoginCommand extends Command {
  static flags = {
    apiKey: flags.string({
      name: 'apiKey',
      // required: true,
      env: 'CHECKLY_API_KEY',
      description:
        'Checkly API Key. \nIf you did not have one, create it at: https://app.checklyhq.com/account/api-keys',
    }),
  }

  async run() {
    const { flags } = this.parse(LoginCommand)

    // API Key already set
    if (flags.apiKey) {
      console.log(chalk.cyanBright(raccoon))
      consola.log(`API Key already set (${generateMaskedKey(flags.apiKey)})`)
      consola.success(' Welcome to checkly-cli 🦝')
      return
    }

    // Prompt for API Key
    const apiKey = await cli.prompt('Please enter your Checkly API Key')

    // Basic validation
    if (apiKey.length !== 32) {
      consola.error('Invalid API Key')
      process.exit(1)
    }

    // Successfully set API Key output
    config.set('apiKey', apiKey)
    config.set('isInitialized', 'true')
    console.log(chalk.blue(raccoon))
    consola.success(' Welcome to checkly-cli 🦝')
    consola.log(`API Key set (${generateMaskedKey(apiKey)})`)
  }
}

LoginCommand.description = 'Login with a Checkly API Key [WIP]'

module.exports = LoginCommand
