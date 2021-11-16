const fs = require('fs')
const path = require('path')
const YAML = require('yaml')
const consola = require('consola')

const { parseChecklyDirectory, parseAlertsDirectory } = require('./file-parser')
const { parseChecksTree } = require('./check-parser')

function parseAlert(alert) {
  if (alert.error) {
    consola.warn(`Skipping file ${alert.filePath}: ${alert.error} `)
    return null
  }

  let parsedAlert = YAML.parse(fs.readFileSync(alert.filePath, 'utf8'))
  const parsedAlertSchema = parsedAlert // alertSchema.validate(parsedAlert)

  if (parsedAlertSchema.error) {
    throw new Error(`${parsedAlertSchema.error} at check: ${alert.filePath}`)
  }

  parsedAlert = parsedAlertSchema // parsedAlertSchema.value

  if (!parsedAlert) {
    consola.warn(`Skipping file ${path.filePath}: FileEmpty`)
    return null
  }

  parsedAlert.logicalId = alert.name

  return parsedAlert
}

function parseAlertsTree(tree) {
  const parsedTree = {}
  for (let i = 0; i < tree.length; i += 1) {
    if (tree[i].type === 'alert-channel') {
      const parsedAlert = parseAlert(tree[i])
      parsedAlert && (parsedTree[parsedAlert.logicalId] = parsedAlert)
    }
  }

  return parsedTree
}

module.exports = async () => {
  const tree = await parseChecksTree(parseChecklyDirectory())
  tree.alerts = await parseAlertsTree(parseAlertsDirectory())

  console.log(tree)

  return tree
}

// async function x() {
//   const tree = await parseChecksTree(parseChecklyDirectory())
//   tree.alerts = await parseAlertsTree(parseAlertsDirectory())

//   console.log(tree)
// }

// x()
