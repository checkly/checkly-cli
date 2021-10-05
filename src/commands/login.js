const chalk = require('chalk')
const jwt_decode = require('jwt-decode') // eslint-disable-line camelcase
const search = require('cli-fuzzy-search')
const consola = require('consola')
const { prompt } = require('inquirer')
const { Command, flags } = require('@oclif/command')

const raccoon = require('./../services/raccoon')
const { accounts } = require('./../services/api')
const {
  generateAuthenticationUrl,
  getAccessToken,
  generatePKCE,
  startServer,
  getApiKey,
} = require('./../services/login-util')

const config = require('./../services/config')
const api = require('./../services/api')

const checkExistingLogin = async () => {
  if (config.getApiKey()) {
    const { setNewkey } = await prompt([
      {
        name: 'setNewkey',
        type: 'confirm',
        message: `API Key already set (${generateMaskedKey(
          config.getApiKey()
        )}), do you want to set a new API Key?`,
      },
    ])

    if (!setNewkey) {
      return process.exit(0)
    }
  }
}

const generateMaskedKey = (key) => {
  const maskedKey = key.replace(/[a-zA-Z0-9]/g, '*').slice(0, key.length - 4)
  const lastFourDigitsKey = key.slice(-4)
  return `${maskedKey}${lastFourDigitsKey}`
}

const loginSuccess = (apiKey) => {
  consola.info(` API Key set (${generateMaskedKey(apiKey)})\n`)
  consola.success(' Welcome to checkly-cli 🦝')
  consola.log('You can now run `checkly init` to setup the project!')
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
    const apiKey = flags.apiKey

    await checkExistingLogin()

    if (!apiKey) {
      const { codeChallenge, codeVerifier } = generatePKCE()
      consola.info(
        ` Please open the following URL in your browser: \n\n${chalk.blueBright(
          generateAuthenticationUrl(
            codeChallenge,
            'openid profile',
            codeVerifier
          )
        )}\n`
      )

      startServer(codeVerifier, async (code) => {
        const {
          access_token: accessToken,
          id_token: idToken,
          scope,
        } = await getAccessToken(code, codeVerifier)

        consola.debug('accessToken:', chalk.blue.bold(accessToken))
        consola.debug('idToken:', chalk.blue.bold(idToken))
        consola.debug('scope:', chalk.blue.bold(scope))

        const { sub: userExternalId, name } = jwt_decode(idToken)

        let keyResponse = await getApiKey({
          userExternalId,
          accessToken,
          baseHost: api.getDefatuls().baseHost,
        })
        consola.debug(' API Key Response', keyResponse)

        // API has returned a list of accounts to choose from as user is in multiple
        if (Array.isArray(keyResponse)) {
          consola.info(' Multiple accounts available, please select one.\n')
          const selectedAccount = await search({
            data: keyResponse.map((account) => {
              return { ...account, label: account.name }
            }),
            size: keyResponse.length + 1,
            cache: false,
            debounceDelay: 200,
          })
          keyResponse = await getApiKey({
            userExternalId,
            accessToken,
            baseHost: api.getDefatuls().baseHost,
            accountId: selectedAccount.id,
          })
        }

        consola.info(
          ` Successfully logged in as ${chalk.blue.bold(name)} (${
            keyResponse.accountName
          })`
        )
        config.auth.set('apiKey', keyResponse.apiKey)
        config.data.set('accountId', keyResponse.accountId)
        config.data.set('accountName', keyResponse.accountName)
        loginSuccess(keyResponse.apiKey)
        process.exit(0)
      })
    } else {
      // TODO: Ask for account default settings like locations and alerts
      config.auth.set('apiKey', apiKey)
      api.refresh()

      const { data } = await accounts.findMe()
      const { accountId, name } = data

      config.data.set('accountId', accountId)
      config.data.set('accountName', name)

      process.stdout.write('\x1Bc')
      process.stdout.write(chalk.blue(raccoon))
      loginSuccess(apiKey)
    }
  }
}

LoginCommand.description = 'Login with a Checkly API Key [WIP]'

module.exports = LoginCommand
