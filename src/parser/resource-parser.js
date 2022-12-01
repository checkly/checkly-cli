const { promises: fs } = require('fs')
const path = require('path')
const walk = require('./walk')
const {
  Project,
  BrowserCheck,
  CheckGroup,
} = require('../../sdk/constructs')
const AlertChannel = require('../../sdk/constructs/AlertChannel')
const Check = require('../../sdk/constructs/Check')

const CHECKLY_CONFIG = 'checkly.config.js'
const NODE_MODULES = 'node_modules'

async function getConfigOutput (project, rootFolder) {
  const callback = compileResourceCallback(project)
  await walk(rootFolder, callback)
  return project.synthesize()
}

function compileResourceCallback (project) {
  return async (filepath, stats) => {
    // Skip node_modules
    if (filepath.endsWith(NODE_MODULES)) {
      return
    }
    if (!filepath.endsWith(CHECKLY_CONFIG)) {
      return
    }
    const exported = require(filepath)
    const resources = Array.isArray(exported) ? exported : [exported]
    for (const resource of resources) {
      if (resource instanceof Check) {
        project.addCheck(resource)
      }
      if (resource instanceof CheckGroup) {
        project.addCheckGroup(resource)
        if (resource.pattern) {
          const checks = await findPattern(resource, path.dirname(filepath), resource.pattern)
          checks.forEach(check => project.addCheck(check))
        }
      }
      if (resource instanceof AlertChannel) {
        project.addAlertChannel(resource)
      }
    }
  }
}

async function findPattern (group, dir, pattern) {
  const files = await fs.readdir(dir)
  return files.map((file) => {
    if (!file.endsWith(pattern)) {
      return null
    }
    const entry = path.join(dir, file)
    const bcr = new BrowserCheck(file, {
      name: file,
      activated: true,
      entry,
    })
    bcr.setGroup(group)
    return bcr
  }, {}).filter(Boolean)
}

async function parseChecklyResources (projectName, rootFolder) {
  const project = new Project(projectName, { name: projectName })
  const result = await getConfigOutput(project, rootFolder)
  return result
}

module.exports = {
  parseChecklyResources,
}
