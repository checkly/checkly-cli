const consola = require('consola')
const chalk = require('chalk')
const formatDistanceToNow = require('date-fns/formatDistanceToNow')

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
          : checkStatus.updated_at
          ? chalk.bgGreen('Passing')
          : chalk.bold('Pending'),
        name: checkStatus.name,
        'last ran': checkStatus.updated_at
          ? formatDistanceToNow(new Date(checkStatus.updated_at))
          : '-',
      }
    })
    print(formatted, { output })
  } catch (err) {
    consola.error(err)
  }
}

module.exports = getStatus
