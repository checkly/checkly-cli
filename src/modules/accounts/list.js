const chalk = require('chalk')
const consola = require('consola')

const config = require('./../../services/config')
const { print } = require('./../../services/utils')
const { accounts } = require('./../../services/api')
const { OUTPUTS } = require('../../services/constants')

async function listAccounts ({ output } = {}) {
  try {
    const { data } = await accounts.getAll()

    if (output === OUTPUTS.HUMAN) {
      data.map((account) => {
        if (account.id === config.getAccountId()) {
          account.id = chalk.blue.bold('✔ ' + account.id)
        }

        return account
      })
    }

    print(data, { output })
  } catch (err) {
    consola.error(err)
    throw err
  }
}

module.exports = listAccounts
