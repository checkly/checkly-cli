const fs = require('fs')
const YAML = require('yaml')
const consola = require('consola')

const { CHECK, parseAlertsDirectory } = require('./file-parser')
const { getGlobalSettings } = require('../services/utils')
const bundle = require('./bundler')

const { checkSchema } = require('../schemas/check')
const { groupSchema } = require('../schemas/group')
const { projectSchema } = require('../schemas/project')

async function parseCheck(check, groupSettings = null) {
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
  const parsedCheckSchema = checkSchema.validate(parsedCheck)

  if (parsedCheckSchema.error) {
    throw new Error(`${parsedCheckSchema.error} at check: ${check.filePath}`)
  }

  parsedCheck = parsedCheckSchema.value

  if (!parsedCheck) {
    consola.warn(`Skipping file ${check.filePath}: FileEmpty`)
    return null
  }

  if (parsedCheck.alertChannelSubscriptions) {
    const alertChannels = parseAlertsDirectory()

    parsedCheck.alertChannelSubscriptions.forEach((subscription, i) => {
      if (!alertChannels.includes(subscription.alertChannel + '.yml')) {
        consola.warn(
          `Skipping alert channel '${subscription.alertChannel}' for check '${parsedCheck.name}' (missing alert channel file).'`
        )
        parsedCheck.alertChannelSubscriptions.splice(i, 1)
      }
    })
  }

  if (parsedCheck.checkType.toLowerCase() === 'browser' && parsedCheck.path) {
    const [output] = await bundle(parsedCheck)
    parsedCheck.script = output.code
    parsedCheck.map = output.map
  }

  parsedCheck.logicalId = check.name
  parsedCheck.settings = { ...project[0], ...parsedCheck.settings }

  return parsedCheck
}

async function parseChecksTree(tree, parent = null) {
  const parsedTree = parent ? { checks: {} } : { checks: {}, groups: {} }

  for (let i = 0; i < tree.length; i += 1) {
    if (tree[i].type === CHECK) {
      const parsedCheck = await parseCheck(tree[i], parent)
      parsedCheck && (parsedTree.checks[parsedCheck.logicalId] = parsedCheck)
      continue
    }

    // We only allow two level of directory nesting:
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
      settings: group,
    }
    const checksLeaf = await parseChecksTree(tree[i].checks, group)
    const newChecksLeaf = { ...checksLeaf.checks, ...parsedTree.checks }
    parsedTree.checks = newChecksLeaf
  }

  return parsedTree
}

module.exports = {
  parseChecksTree,
}
