const { prompt } = require('inquirer')
const consola = require('consola')
const http = require('http')
const crypto = require('crypto')
const { Buffer } = require('buffer')

const { Command, flags } = require('@oclif/command')
const chalk = require('chalk')

const raccoon = require('../services/raccoon')
const config = require('../services/config')

const { account } = require('./../services/api')
const api = require('./../services/api')
const { url } = require('inspector')

const auth0AuthenticationUrl = (codeChallenge, scope, state) => {
  const url = new URL(
    `https://${process.env.AUTH0_DOMAIN}.eu.auth0.com/authorize`
  )
  const params = new URLSearchParams({
    client_id: process.env.AUTH0_CLIENT_ID,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    response_type: 'code',
    redirect_uri: 'http://localhost:4242',
    scope: scope,
    state: state,
  })

  url.searchParams = params
  console.log(url.toString())
  return url.toString()
}

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
    const apiKey = flags.apiKey

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
      const codeVerifier = crypto.randomBytes(128)
      console.log('cV', codeVerifier.toString())
      const hash = crypto
        .createHash('sha256')
        .update(codeVerifier)
        .digest('base64')

      console.log('hash', hash)
      const codeChallenge = Buffer.from(hash, 'base64')

      console.log('cC', codeChallenge.toString('base64'))

      consola.info(
        `Please open the following URL in your browser - ${auth0AuthenticationUrl()}.`
      )
      const server = http
        .createServer((req, res) => {
          const urlQuery = url.parse(req.url, true).query
          const { code, state, error, errorDescription } = urlQuery

          // this validation was simplified for the example
          if (code && state) {
            res.write(`
      <html>
      <body>
        <h1>LOGIN SUCCEEDED</h1>
      </body>
      </html>
    `)
          } else {
            res.write(`
      <html>
      <body>
        <h1>LOGIN FAILED</h1>
        <div>${error}</div>
        <div>${errorDescription}
      </body>
      </html>
    `)
          }

          res.end()
        })
        .listen(4242, (err) => {
          if (err) {
            console.log(`Unable to start an HTTP server on port 4242.`, err)
          }
        })
    }

    // TODO: Ask for account default settings like locations and alerts

    config.set('apiKey', apiKey)
    config.set('isInitialized', 'true')
    api.refresh()

    const { data } = await account.findOne()
    const { accountId, name } = data

    config.set('accountId', accountId)
    config.set('accountName', name)

    process.stdout.write('\x1Bc')
    process.stdout.write(chalk.blue(raccoon))
    consola.info(`API Key set (${generateMaskedKey(apiKey)})\n`)
    consola.success(' Welcome to checkly-cli 🦝')
    consola.log('You can now run `checkly init` to setup the project!')
  }
}

LoginCommand.description = 'Login with a Checkly API Key [WIP]'

module.exports = LoginCommand
