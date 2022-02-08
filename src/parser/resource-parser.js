const fs = require('fs')
const path = require('path')
const YAML = require('yaml')
const consola = require('consola')

const bundle = require('./bundler')
const { CHECK, ALERT_CHANNEL } = require('./resources')
const { getGlobalSettings } = require('../services/utils')

const { checkSchema } = require('../schemas/check')
const { groupSchema } = require('../schemas/group')
const { projectSchema } = require('../schemas/project')
const { alertChannelSchema } = require('../schemas/alert')

function parseCheckAlertChannelSubscriptions (resource, alertChannels) {
  if (!resource.alertChannelSubscriptions) {
    return []
  }

  resource.alertChannelSubscriptions.forEach((subscription, i) => {
    if (!alertChannels[subscription.alertChannel]) {
      consola.warn(
        `Skipping alert channel subscription'${subscription.alertChannel}' for check '${resource.alertChannel}' (missing alert channel file).'`
      )

      resource.alertChannelSubscriptions.splice(i, 1)
    }
  })
  console.log('parseCheckAlertChannelSubscriptions', resource.alertChannelSubscriptions)
  return resource.alertChannelSubscriptions
}

async function parseCheck (check, { project, alertChannels }) {
  if (check.error) {
    consola.warn(`Skipping file ${check.filePath}: ${check.error} `)
    return null
  }

  let parsedCheck = YAML.parse(fs.readFileSync(check.filePath, 'utf8'))

  if (!parsedCheck) {
    consola.warn(`Skipping file ${check.filePath}: FileEmpty`)
    return null
  }

  parsedCheck.alertChannelSubscriptions = parseCheckAlertChannelSubscriptions(
    parsedCheck,
    alertChannels
  )

  if (parsedCheck.checkType.toLowerCase() === 'browser') {
    const [output] = await bundle(parsedCheck)
    parsedCheck.script = output.code
    parsedCheck.map = output.map
  }

  // Merge project default check settings with check settings
  parsedCheck = { ...project.defaultCheckSettings, ...parsedCheck }

  const parsedCheckSchema = checkSchema.validate(parsedCheck)
  if (parsedCheckSchema.error) {
    throw new Error(`${parsedCheckSchema.error} at check: ${check.filePath}`)
  }

  parsedCheck = parsedCheckSchema.value

  parsedCheck.logicalId = check.name

  return parsedCheck
}

function parseGroup (group, { project }) {
  const settings = fs.existsSync(group.settings) ? YAML.parse(fs.readFileSync(group.settings, 'utf8')) : {}
  const parsedGroup = {
    name: group.name,
    ...project.defaultCheckSettings,
    ...settings
  }

  const parsedGroupSchema = groupSchema.validate(parsedGroup)
  if (parsedGroupSchema.error) {
    throw new Error(
          `${parsedGroupSchema.error} at group: ${group.settings}`
    )
  }

  return parsedGroupSchema.value
}

async function parseChecksTree (tree, resources, parent = null) {
  const parsedTree = parent ? { checks: {} } : { checks: {}, groups: {} }

  for (let i = 0; i < tree.length; i += 1) {
    if (tree[i].type === CHECK.name) {
      const parsedCheck = await parseCheck(tree[i], resources)
      parsedCheck && (parsedTree.checks[parsedCheck.logicalId] = parsedCheck)
      continue
    }

    // NOTE: We only allow two level of directory nesting:
    // root checks and checks within a group.
    if (parent) {
      continue
    }

    const group = parseGroup(tree[i], resources)
    parsedTree.groups[tree[i].name] = group

    const checksLeaf = await parseChecksTree(tree[i].checks, resources, group)
    for (const check of Object.values(checksLeaf.checks)) {
      check.groupId = {
        ref: tree[i].name
      }
    }
    const newChecksLeaf = { ...checksLeaf.checks, ...parsedTree.checks }
    parsedTree.checks = newChecksLeaf
  }

  return parsedTree
}

function parseAlertChannel (alert) {
  if (alert.error) {
    consola.warn(`Skipping file ${alert.filePath}: ${alert.error} `)
    return null
  }

  let parsedAlert = YAML.parse(fs.readFileSync(alert.filePath, 'utf8'))
  const parsedAlertSchema = alertChannelSchema.validate(parsedAlert)
  if (parsedAlertSchema.error) {
    throw new Error(`${parsedAlertSchema.error} at alert channel: ${alert.filePath}`)
  }

  parsedAlert = parsedAlertSchema.value

  if (!parsedAlert) {
    consola.warn(`Skipping file ${path.filePath}: FileEmpty`)
    return null
  }

  parsedAlert.logicalId = alert.name

  return parsedAlert
}

function parseAlertChannelsTree (tree) {
  const parsedTree = { alertChannels: {} }
  for (let i = 0; i < tree.length; i += 1) {
    if (tree[i].type === ALERT_CHANNEL.name) {
      const parsedAlert = parseAlertChannel(tree[i])
      parsedAlert &&
        (parsedTree.alertChannels[parsedAlert.logicalId] = parsedAlert)
      delete parsedTree.alertChannels[parsedAlert.logicalId].logicalId
    }
  }

  return parsedTree
}

function parseAlertChannelSubscriptions (
  resource,
  resourceLogicalId,
  type = 'check'
) {
  const alertChannelSubscriptions = {}

  resource.alertChannelSubscriptions.forEach((subscription) => {
    const { alertChannel, activated } = subscription
    const logicalId = `${resourceLogicalId}/${alertChannel}`

    alertChannelSubscriptions[logicalId] = {
      alertChannelId: { ref: alertChannel },
      [type === 'check' ? 'checkId' : 'groupId']: { ref: resourceLogicalId },
      activated
    }
  })

  return alertChannelSubscriptions
}

function parseAlertChannelSubscriptionsTree (tree, type = 'check') {
  let parsedTree = {}

  Object.keys(tree).forEach((key) => {
    if (tree[key].alertChannelSubscriptions?.length) {
      parsedTree = {
        ...parsedTree.alertChannelSubscriptions,
        ...parseAlertChannelSubscriptions(tree[key], key, type)
      }
    }
  })

  return parsedTree
}

function parseProject () {
  const project = YAML.parse(getGlobalSettings())
  const parsedProjectSchema = projectSchema.validate(project)

  if (parsedProjectSchema.error) {
    throw new Error(`${parsedProjectSchema.error} at global settings.yml`)
  }

  return parsedProjectSchema.value
}

module.exports = {
  parseProject,
  parseChecksTree,
  parseAlertChannelsTree,
  parseAlertChannelSubscriptionsTree
}
