const consola = require('consola')
const isEqual = require('lodash.isequal')

function getCheckTasks (currentState, newState) {
  const checks = {
    create: {},
    delete: {},
    update: {}
  }

  Object.keys(currentState.checks).forEach((check) => {
    if (currentState.checks[check] && !newState.checks[check]) {
      consola.debug(`Remove: ${check}`)
      checks.delete[check] = currentState.checks[check]
      return
    }

    if (!isEqual(currentState.checks[check], newState.checks[check])) {
      consola.debug(`Update: ${check}`)
      checks.update[check] = newState.checks[check]
    }
  })

  Object.keys(newState.checks).forEach((check) => {
    if (newState.checks[check] && !currentState.checks[check]) {
      consola.debug(`Create: ${check}`)
      checks.create[check] = newState.checks[check]
    }
  })

  return checks
}

function diff (currentState, newState) {
  const checks = getCheckTasks(currentState, newState)
  const groups = {
    create: {},
    delete: {},
    update: {}
  }

  Object.keys({ ...currentState.groups, ...newState.groups }).forEach(
    (group) => {
      if (!currentState.groups[group] && newState.groups[group]) {
        groups.create[group] = newState.groups[group]
        return
      }
      if (currentState.groups[group] && !newState.groups[group]) {
        groups.delete[group] = currentState.groups[group]
        return
      }

      groups.update[group] = {
        ...newState.groups[group],
        checks: getCheckTasks(
          currentState.groups[group],
          newState.groups[group]
        )
      }
    }
  )

  return { checks, groups }
}

module.exports = diff
