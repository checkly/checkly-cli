const chalk = require('chalk')
const consola = require('consola')

const config = require('./../../services/config')
const { print } = require('./../../services/utils')
const { accounts } = require('./../../services/api')

async function listAccounts({ output } = {}) {
  try {
    const { data } = await accounts.find()

    if (output === 'human') {
      data.map((account) => {
        if (account.id === config.data.get('accountId')) {
          account.id = chalk.blue.bold('✔ ' + account.id)
        }

        return account
      })
    }

    print(data, { output })
  } catch (err) {
    consola.error(err)
  }
}

module.exports = listAccounts
