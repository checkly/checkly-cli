const chalk = require('chalk')
const open = require('open')

const jwt_decode = require('jwt-decode') // eslint-disable-line camelcase
const consola = require('consola')
const { prompt } = require('inquirer')
const { Command, flags } = require('@oclif/command')

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
        message: `Existing session with account ${chalk.bold.blue(
          config.data.get('accountName')
        )}, do you want to continue?`,
      },
    ])

    !setNewkey && process.exit(0)
  }
}

const loginSuccess = () => {
  consola.success('Welcome to @checkly/cli 🦝')
  consola.log(
    `\nYou can now run ${chalk.blue(
      `\`$ checkly init\``
    )} to setup the project!`
  )
}

class LoginCommand extends Command {
  async run() {
    const { flags } = this.parse(LoginCommand)
    const { 'api-key': apiKey, 'account-id': accountId } = flags

    if (apiKey) {
      if (!accountId) {
        consola.error(
          'The flag --account-id (-i) is required when using --api-key (-k)'
        )
        this.exit(1)
      }

      config.auth.set('apiKey', apiKey)
      config.data.set('accountId', accountId)

      loginSuccess()
      this.exit(0)
    }

    await checkExistingLogin()
    const { codeChallenge, codeVerifier } = generatePKCE()
    const authServerUrl = generateAuthenticationUrl(
      codeChallenge,
      'openid profile',
      codeVerifier
    )

    const { openUrl } = await prompt([
      {
        name: 'openUrl',
        type: 'confirm',
        message: 'Do you allow to open the browser to continue with login?',
      },
    ])

    if (!openUrl) {
      process.stdout.write('\n')
      consola.info(
        ` Please open the following URL in your browser: \n\n${chalk.blueBright(
          authServerUrl
        )}\n`
      )
    } else {
      await open(authServerUrl)
    }

    startServer(codeVerifier, async (code) => {
      const {
        access_token: accessToken,
        id_token: idToken,
      } = await getAccessToken(code, codeVerifier)

      const { name } = jwt_decode(idToken)
      const { key } = await getApiKey({
        accessToken,
        baseHost: api.getDefatuls().baseHost,
      })

      config.auth.set('apiKey', key)
      api.refresh()

      const { data } = await accounts.find({ spinner: false })

      const { accountName } = await prompt([
        {
          name: 'accountName',
          type: 'list',
          choices: data,
          message: 'Which account do you want to use?',
        },
      ])

      const selectedAccount = data.find(({ name }) => name === accountName)
      config.data.set('accountId', selectedAccount.id)
      config.data.set('accountName', selectedAccount.name)

      process.stdout.write('\n')
      consola.info(` Successfully logged in as ${chalk.blue.bold(name)}`)

      loginSuccess()
      process.exit(0)
    })
  }
}

LoginCommand.description = 'Login with a Checkly API Key'

LoginCommand.flags = {
  'api-key': flags.string({
    char: 'k',
    name: 'apiKey',
    description:
      'Checkly User API Key. \nIf you did not have one, create it at: https://app.checklyhq.com/account/api-keys',
  }),

  'account-id': flags.string({
    char: 'i',
    name: 'accountId',
    description:
      'Checkly account ID. (This flag is required if you are using -k (--api-key) flag',
  }),
}

module.exports = LoginCommand
