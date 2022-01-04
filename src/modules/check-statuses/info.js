const consola = require('consola')
const chalk = require('chalk')
const formatDistanceToNow = require('date-fns/formatDistanceToNow')

const { print } = require('../../services/utils')
const { checkStatuses } = require('../../services/api')
const { OUTPUTS, CHECK_STATUS } = require('../../services/constants')

function getStatusText ({ checkStatus, output }) {
  if (checkStatus.hasFailures) {
    return output === OUTPUTS.JSON ? CHECK_STATUS.FAILING : chalk.bgRed(CHECK_STATUS.FAILING)
  }
  if (checkStatus.isDegraded) {
    return output === OUTPUTS.JSON ? CHECK_STATUS.DEGRADED : chalk.bgYellow(CHECK_STATUS.DEGRADED)
  }
  // In case a check was recently created and there is no update on the status
  if (!checkStatus.updated_at) {
    return output === OUTPUTS.JSON ? CHECK_STATUS.PENDING : chalk.bold(CHECK_STATUS.PENDING)
  }
  return output === OUTPUTS.JSON ? CHECK_STATUS.PASSING : chalk.bgGreen(CHECK_STATUS.PASSING)
}

function getFormatedCheckStatus ({ data, output }) {
  return data.map((checkStatus) => {
    return {
      status: getStatusText({ checkStatus, output }),
      name: checkStatus.name,
      'last ran': checkStatus.updated_at
        ? formatDistanceToNow(new Date(checkStatus.updated_at))
        : '-'
    }
  })
}

async function getStatus ({ output } = {}) {
  try {
    const { data } = await checkStatuses.getAll()
    const formatted = getFormatedCheckStatus({ data, output })
    print(formatted, { output })
  } catch (err) {
    consola.error(err)
    throw err
  }
}

module.exports = getStatus
