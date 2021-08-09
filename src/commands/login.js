const { prompt } = require('inquirer')
const consola = require('consola')

const { Command, flags } = require('@oclif/command')
const chalk = require('chalk')

const raccoon = require('../services/raccoon')
const config = require('../services/config')

const { account } = require('./../services/api')

const generateMaskedKey = (key) => {
  const maskedKey = key.replace(/[a-zA-Z0-9]/g, '*').slice(0, key.length - 4)
  const lastFourDigitsKey = key.slice(-4)
  return `${maskedKey}${lastFourDigitsKey}`
}

class LoginCommand extends Command {
  static flags = {
    apiKey: flags.string({
      name: 'apiKey',
      description:
        'Checkly API Key. \nIf you did not have one, create it at: https://app.checklyhq.com/account/api-keys',
    }),
  }

  async run() {
    const { flags } = this.parse(LoginCommand)
    let apiKey = flags.apiKey

    if (config.get('apiKey')) {
      const { setNewkey } = await prompt([
        {
          name: 'setNewkey',
          type: 'confirm',
          message: `API Key already set (${generateMaskedKey(
            config.get('apiKey')
          )}), do you want to set a new API Key?`,
        },
      ])

      if (!setNewkey) {
        return process.exit(0)
      }
    }

    if (!apiKey) {
      consola.info(
        'Generate your Checkly API Key here: https://app.checklyhq.com/account/api-keys'
      )
      const { newApiKey } = await prompt([
        {
          name: 'newApiKey',
          validate: (apiKey) =>
            apiKey.length === 32 ? true : 'Please provide a valid API Key',
          message: 'Please enter your Checkly API Key',
        },
      ])

      apiKey = newApiKey
    }

    // TODO: Ask for account default settings like locations and alerts

    const { data } = await account.findOne()
    const { accountId, name } = data

    config.set('accountId', accountId)
    config.set('accountName', name)

    config.set('apiKey', apiKey)
    config.set('isInitialized', 'true')

    // Output success message and next steps
    console.log(chalk.blue(raccoon))
    consola.log(`API Key set (${generateMaskedKey(apiKey)})\n`)
    consola.success(' Welcome to checkly-cli 🦝')
    consola.log('You can now run `checkly init` to setup the project!')
  }
}

LoginCommand.description = 'Login with a Checkly API Key [WIP]'

module.exports = LoginCommand
