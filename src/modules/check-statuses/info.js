const consola = require('consola')
const chalk = require('chalk')
const formatDistanceToNow = require('date-fns/formatDistanceToNow')

const { checkStatuses } = require('../../services/api')
const { print } = require('../../services/utils')

const STATUS = {
  FAILING: 'Failing',
  DEGRADED: 'Degraded',
  PASSING: 'Passing',
  PENDING: 'Pending',
}

function getStatusText({ checkStatus, output }) {
  if (checkStatus.hasFailures) {
    return output === 'json' ? STATUS.FAILING : chalk.bgRed(STATUS.FAILING)
  }
  if (checkStatus.isDegraded) {
    return output === 'json' ? STATUS.DEGRADED : chalk.bgYellow(STATUS.DEGRADED)
  }
  if (checkStatus.updated_at) {
    return output === 'json' ? STATUS.DEGRADED : chalk.bgGreen(STATUS.DEGRADED)
  }

  return output === 'json' ? STATUS.PENDING : chalk.bold(STATUS.PENDING)
}

function getFormatedCheckStatus({ data, output }) {
  return data.map((checkStatus) => {
    return {
      status: getStatusText({ checkStatus, output }),
      name: checkStatus.name,
      'last ran': checkStatus.updated_at
        ? formatDistanceToNow(new Date(checkStatus.updated_at))
        : '-',
    }
  })
}

async function getStatus({ output } = {}) {
  try {
    const { data } = await checkStatuses.getAll()
    const formatted = getFormatedCheckStatus({ data, output })
    print(formatted, { output })
  } catch (err) {
    consola.error(err)
  }
}

module.exports = getStatus
