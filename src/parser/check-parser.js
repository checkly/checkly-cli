const fs = require('fs')
const YAML = require('yaml')
const consola = require('consola')

const { CHECK } = require('./file-parser')
const { getGlobalSettings } = require('./helper')

function parseCheck(check, groupSettings = null) {
  const { settings } = YAML.parse(getGlobalSettings())
  if (check.error) {
    consola.warn(`Skipping file ${check.filePath}: ${check.error} `)
    return null
  }

  const parsedCheck = YAML.parse(fs.readFileSync(check.filePath, 'utf8'))

  if (!parsedCheck) {
    consola.warn(`Skipping file ${check.filePath}: FileEmpty`)
    return null
  }

  parsedCheck.key = check.name
  parsedCheck.settings = { ...settings, ...parsedCheck.settings }

  if (groupSettings) {
    // TODO: Remove settings that are not allowed to override by a check (like locations)
    parsedCheck.settings = {
      ...settings,
      ...groupSettings,
      ...parsedCheck.settings,
    }
  }

  return parsedCheck
}

function parseChecksTree(tree, parent = null) {
  const parsedTree = parent ? { checks: {} } : { checks: {}, groups: {} }

  tree.forEach((leaf) => {
    if (leaf.type === CHECK) {
      const parsedCheck = parseCheck(leaf, parent)
      parsedCheck && (parsedTree.checks[parsedCheck.key] = parsedCheck)
      return
    }

    // We only allow two level of directory nesting: root checks and checks within a group.
    if (parent) {
      return
    }

    const groupSettings = YAML.parse(fs.readFileSync(leaf.settings, 'utf8'))

    parsedTree.groups[leaf.name] = {
      name: leaf.name,
      settings: groupSettings.settings,
      ...parseChecksTree(leaf.checks, groupSettings.settings),
    }
  })

  return parsedTree
}

module.exports = {
  parseChecksTree,
}
