const consola = require('consola')
const chalk = require('chalk')
const moment = require('moment')
const { checkStatuses } = require('../../services/api')

const { print } = require('../../services/utils')

async function getStatus({ output } = {}) {
  try {
    const { data } = await checkStatuses.getAll()
    const formatted = data.map((checkStatus) => {
      return {
        status: checkStatus.hasFailures
          ? chalk.bgRed('Failing')
          : checkStatus.isDegraded
          ? chalk.bgYellow('Degraded')
          : chalk.bgGreen('Passing'),
        name: checkStatus.name,
        'last updated': moment(checkStatus.updated_at).fromNow(),
      }
    })
    print(formatted, { output })
  } catch (err) {
    consola.error(err)
  }
}

module.exports = getStatus
