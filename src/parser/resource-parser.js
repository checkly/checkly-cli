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

function parseCheckAlertChannelSubscriptions (resource, alertChannels) {
  if (!resource.alertChannelSubscriptions) {
    return []
  }

  resource.alertChannelSubscriptions.forEach((subscription, i) => {
    if (!alertChannels[subscription.name]) {
      consola.warn(
        `Skipping alert channel subscription'${subscription.name}' for check '${resource.name}' (missing alert channel file).'`
      )

      resource.alertChannelSubscriptions.splice(i, 1)
    }
  })

  return resource.alertChannelSubscriptions
}

async function parseCheck (check, { alertChannels }) {
  const project = YAML.parse(getGlobalSettings())
  const parsedProjectSchema = projectSchema.validate(project)

  if (parsedProjectSchema.error) {
    throw new Error(`${parsedProjectSchema.error} at global settings.yml`)
  }

  // Remove project properties which are not check/group settings
  delete project.projectName
  delete project.projectId

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

  const parsedCheckSchema = checkSchema.validate(parsedCheck)
  if (parsedCheckSchema.error) {
    throw new Error(`${parsedCheckSchema.error} at check: ${check.filePath}`)
  }

  parsedCheck = parsedCheckSchema.value

  parsedCheck.logicalId = check.name
  parsedCheck.settings = { ...project[0], ...parsedCheck.settings }

  return parsedCheck
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

    let group = {}
    if (fs.existsSync(tree[i].settings)) {
      group = YAML.parse(fs.readFileSync(tree[i].settings, 'utf8')) || {}

      if (Object.keys(group).length) {
        const parsedGroupSchema = groupSchema.validate(group)
        if (parsedGroupSchema.error) {
          throw new Error(
            `${parsedGroupSchema.error} at group: ${tree[i].settings}`
          )
        }

        group = parsedGroupSchema.value
      }
    }

    parsedTree.groups[tree[i].name] = {
      name: tree[i].name,
      ...group
    }

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

  // TODO: validate alert channel with schema
  // const parsedAlertSchema = alertSchema.validate(parsedAlert)
  const parsedAlertSchema = parsedAlert

  if (parsedAlertSchema.error) {
    throw new Error(`${parsedAlertSchema.error} at check: ${alert.filePath}`)
  }

  // parsedAlert = parsedAlertSchema.value
  parsedAlert = parsedAlertSchema

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

  if (resource.alertChannelSubscriptions) {
    resource.alertChannelSubscriptions.forEach((subscription) => {
      const { name, activated } = subscription
      const logicalId = `${resourceLogicalId}/${name}`

      alertChannelSubscriptions[logicalId] = {
        alertChannelId: { ref: name },
        [type === 'check' ? 'checkId' : 'groupId']: { ref: resourceLogicalId },
        activated
      }
    })
  }

  return alertChannelSubscriptions
}

function parseAlertChannelSubscriptionsTree (tree, type = 'check') {
  let parsedTree = {}

  Object.keys(tree).forEach((key) => {
    parsedTree = {
      ...parsedTree.alertChannelSubscriptions,
      ...parseAlertChannelSubscriptions(tree[key], key, type)
    }
  })

  return parsedTree
}

module.exports = {
  parseChecksTree,
  parseAlertChannelsTree,
  parseAlertChannelSubscriptionsTree
}
