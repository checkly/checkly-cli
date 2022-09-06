const consola = require('consola')
const { checks } = require('../../services/api')
const { groups } = require('../../services/api')
const { snippets } = require('../../services/api')
const { alertChannels } = require('../../services/api')

const fs = require('fs/promises')
const path = require('path')
const JSON5 = require('json5')

const importResources = { resources: [] }

// super helpful to check for case mismatches etc.
// https://github.com/checkly/pulumi-checkly/blob/main/provider/cmd/pulumi-resource-checkly/schema.json
// nice examples: https://github.com/checkly/pulumi-checkly/blob/main/examples/js/index.js

function snakecase (text) {
  return text.toLowerCase().replace(/[^a-zA-Z0-9 ]/g, '-').replace(/\s/g, '-')
}

function frequency (check) {
  if (check.checkType === 'API') {
    if (check.frequency !== 0) {
      return `frequency: ${check.frequency},`
    }
    return `frequency: 0,
     frequencyOffset: ${check.frequencyOffset},`
  }
  return `frequency: ${check.frequency},`
}

function transformAlertSettings (settings) {
  const s = {
    escalationType: settings.escalationType,
    reminders: [settings.reminders],
    runBasedEscalations: [settings.runBasedEscalations],
    timeBasedEscalations: [settings.timeBasedEscalations],
  }
  if (s.escalationType === 'RUN_BASED' &&
    settings.reminders.amount === 0 &&
    settings.reminders.interval === 5 &&
    !settings.runBasedEscalations &&
    !settings.timeBasedEscalations
  ) {
    return ''
  }
  return 'alertSettings:' + JSON5.stringify(s, null, 2) + '\n'
}

function fixHeaders (headers) {
  if (!headers) {
    return
  }
  const newParams = []
  for (const queryParam of headers) {
    const qp = {}
    qp[queryParam.key] = queryParam.value
    newParams.push(qp)
  }
  return newParams
}

function transformRequest (request) {
  const newParams = []

  if (request.queryParameters.length > 0) {
    for (const queryParam of request.queryParameters) {
      const qp = {}
      qp[queryParam.key] = queryParam.value
      newParams.push(qp)
    }

    request.queryParameters = newParams
  } else {
    delete request.queryParameters
  }

  request.headers = fixHeaders(request.headers)
  if (request.headers.length === 0) {
    delete request.headers
  }
  if (request.assertions.length === 0) {
    delete request.assertions
  }
  if (request.basicAuth?.password === '' && request.basicAuth?.username === '') {
    delete request.basicAuth
  }

  if (!request.skipSsl) {
    delete request.skipSsl
  }

  if (request.followRedirects) {
    delete request.followRedirects
  }

  if (request.body === '') {
    delete request.body
  }
  if (request.bodyType === 'NONE') {
    delete request.bodyType
  }

  if (request.method === 'GET') {
    delete request.method
  }

  const requestCode = JSON5.stringify(request, null, 2)
  return requestCode.replace('{', '{...apiRequestDefaults, ')
}

let checkCounter = 0
const groupsWithApiChecks = []
const apiChecksPerGroup = {}
const snippetsPerGroup = {}

function pulumifyApiCheck (check) {
  let snippetImport = ''
  if (check.setupSnippetId != null) {
    snippetImport += `
    setupSnippetId: ${snippetsMap[check.setupSnippetId]}.id.apply(id => parseInt(id)),`
    const groupId = check.groupId || '__nogroup'
    if (!snippetsPerGroup[groupId]) {
      snippetsPerGroup[groupId] = []
    }
    snippetsPerGroup[groupId].push(snippetsMap[check.setupSnippetId])
  }
  if (check.tearDownSnippetId != null) {
    snippetImport += `
    teardownSnippetId: ${snippetsMap[check.tearDownSnippetId]}.id.apply(id => parseInt(id)),`
    const groupId = check.groupId || '__nogroup'
    if (!snippetsPerGroup[groupId]) {
      snippetsPerGroup[groupId] = []
    }
    snippetsPerGroup[groupId].push(snippetsMap[check.tearDownSnippetId])
  }
  check.headers = fixHeaders(check.headers)
  // console.log(check)
  check.request.skipSsl = check.request.skipSSL
  delete check.request.skipSSL
  let groupId = ''
  if (check.groupId) {
    groupId = 'groupId: groupDefinition.id.apply(id => parseInt(id)),'
    groupsWithApiChecks.push(groupMap[check.groupId])
    if (apiChecksPerGroup[check.groupId] === undefined) apiChecksPerGroup[check.groupId] = ''
  }

  let checkCode = `
new checkly.Check("check${checkCounter++}-${snakecase(check.name)}", { ...apiCheckDefaults,
  name: "${check.name}",
  request: ${transformRequest(check.request)},
  ${frequency(check)}
  `
  checkCode += apiCheckDefaults.activated(check.activated)
  checkCode += apiCheckDefaults.muted(check.muted)
  checkCode += apiCheckDefaults.shouldFail(check.shouldFail)
  checkCode += apiCheckDefaults.doubleCheck(check.doubleCheck)
  checkCode += apiCheckDefaults.locations(check.locations)
  checkCode += apiCheckDefaults.privateLocations(check.privateLocations)
  checkCode += apiCheckDefaults.environmentVariables(check.environmentVariables)
  checkCode += apiCheckDefaults.tags(check.tags)
  checkCode += apiCheckDefaults.useGlobalAlertSettings(check.useGlobalAlertSettings)
  checkCode += transformAlertSettings(check.alertSettings)
  checkCode += apiCheckDefaults.degradedResponseTime(check.degradedResponseTime)
  checkCode += apiCheckDefaults.maxResponseTime(check.maxResponseTime)
  checkCode += groupId
  checkCode += apiCheckDefaults.localSetupScript(check.localSetupScript)
  checkCode += apiCheckDefaults.localTearDownScript(check.localTearDownScript)
  checkCode += snippetImport
  checkCode += extractAlertSubscriberCode(check.alertChannelSubscriptions)

  checkCode += '\n  })\n'

  if (check.groupId) {
    apiChecksPerGroup[check.groupId] += checkCode
  } else {
    apiChecksPerGroup.__nogroup += checkCode
  }

  return checkCode
}

const apiCheckDefaults = {
  muted: (x) => x ? `muted: ${x},\n` : '',
  activated: (x) => !x ? `activated: ${x},\n` : '',
  degradedResponseTime: (x) => x !== 5000 ? `degradedResponseTime: ${x},\n` : '',
  maxResponseTime: (x) => x !== 20000 ? `maxResponseTime: ${x},\n` : '',
  shouldFail: (x) => x ? `shouldFail: ${x},\n` : '',
  doubleCheck: (x) => !x ? `doubleCheck: ${x},\n` : '',
  privateLocations: (x) => x?.length === 0 ? '' : 'privateLocations: ' + JSON5.stringify(x) + ',\n',
  locations: (x) => x?.length === 0 ? '' : 'locations: ' + JSON5.stringify(x) + ',\n',
  environmentVariables: (x) => x?.length === 0 ? '' : 'environmentVariables: ' + JSON5.stringify(x) + ',\n',
  tags: (x) => x?.length === 0 ? '' : 'tags: ' + JSON5.stringify(x) + ',\n',
  useGlobalAlertSettings: (x) => !x ? `useGlobalAlertSettings: ${x},\n` : '',
  localSetupScript: (x) => x === null ? '' : 'localSetupScript: ' + JSON5.stringify(x) + ',\n',
  localTearDownScript: (x) => x === null ? '' : 'localTearDownScript: ' + JSON5.stringify(x) + ',\n',
}

const apiDefaultsCode = `
const apiCheckDefaults = {
  type: "API",
  muted : false,
  activated: true,
  shouldFail: false,
  doubleCheck: true,
  privateLocations: [],
  environmentVariables: [],
  tags: [],
  useGlobalAlertSettings: true,
  localSetupScript: null,
  localTearDownScript: null,
  degradedResponseTime: 5000,
  maxResponseTime: 20000,
  alertSettings: {
    escalationType: 'RUN_BASED',
    reminders: [
      {
        amount: 0,
        interval: 5,
      },
    ],
    runBasedEscalations: [],
    timeBasedEscalations: [],
  },
  alertChannelSubscriptions: []
}
`

const requestDefaultsCode = `
const apiRequestDefaults = {
  method: 'GET',
  queryParameters: [],
  headers: [],
  assertions: [],
  basicAuth: {
    password: '',
    username: '',
  },
  body: '',
  bodyType: 'NONE',
  assertions: [],
  followRedirects: true,
  skipSsl: false,

}
`

let groupCounter = 0
const groupMap = {}

function extractAlertSubscriberCode (alertChannelSubscriptions) {
  if (alertChannelSubscriptions.length === 0) {
    return ''
  }
  let alertChannelSubscriptionsCode = 'alertChannelSubscriptions: ['
  for (const sub of alertChannelSubscriptions) {
    alertChannelSubscriptionsCode += `
    {
      activated: ${sub.activated},
      channelId: ${alertChannelMap[sub.alertChannelId]}.id.apply(id => parseInt(id))
    },
    `
  }
  alertChannelSubscriptionsCode += '],'
  return alertChannelSubscriptionsCode
}

function pulumifyGroup (group) {
  console.log(group)
  const groupName = `group${groupCounter++}-${snakecase(group.name)}`
  const groupVariableName = groupName.replace(/-/g, '_')
  groupMap[group.id] = groupVariableName
  group.apiCheckDefaults.headers = fixHeaders(group.apiCheckDefaults.headers)
  const groupCode = `
const ${groupVariableName} = new checkly.CheckGroup("${groupName}", {
  name: "${group.name}",
  apiCheckDefaults: ${JSON5.stringify(group.apiCheckDefaults, null, 2)} ,
  browserCheckDefaults: ${JSON5.stringify(group.browserCheckDefaults, null, 2)} ,
  concurrency: ${group.concurrency},
  activated: ${group.activated},
  muted: ${group.muted},
  shouldFail: ${group.shouldFail},
  doubleCheck: ${group.doubleCheck},
  locations: ${JSON5.stringify(group.locations)},
  privateLocations: ${JSON5.stringify(group.privateLocations)},
  environmentVariables: ${JSON5.stringify(group.environmentVariables)},
  tags: ${JSON5.stringify(group.tags)},
  useGlobalAlertSettings: ${group.useGlobalAlertSettings},
  ${transformAlertSettings(group.alertSettings)}
  degradedResponseTime: ${group.degradedResponseTime},
  maxResponseTime: ${group.maxResponseTime},
  ${extractAlertSubscriberCode(group.alertChannelSubscriptions)}
  })
  `
  return groupCode
}

const browserCheckScriptMap = {}
const browserCheckScriptsPerGroup = {}

async function extractPerGroup (browserChecks, groups) {
  for (const group of groups) {
    const checksInGroup = browserChecks.filter(b => b.groupId === group.id)
    if (!checksInGroup) {
      continue
    }
    const scripts = await extractScripts(checksInGroup)
    browserCheckScriptsPerGroup[group.id] = scripts
  }
  const checksWithoutGroup = browserChecks.filter(b => b.groupId === undefined || b.groupId === null)
  const scripts = await extractScripts(checksWithoutGroup)
  browserCheckScriptsPerGroup.__nogroup = scripts
}

async function extractScripts (browserChecks) {
  let scode = ''
  const checks = []
  const readFiles = []
  const fileInfo = []
  const result = {}

  for (const bc of browserChecks) {
    const checkName = `check${checkCounter++}-${snakecase(bc.name)}`
    checkNames[bc.id] = checkName
    const checkVariableName = checkName.replace(/-/g, '_')
    const scriptVariableName = 'browserScriptFor_' + checkVariableName
    browserCheckScriptMap[bc.id] = scriptVariableName
    fileInfo.push({ scriptVariableName, code: bc.script, filename: checkVariableName + '.script.js' })
    readFiles.push(`fs.readFile(path.join(__dirname,"./scripts/${checkVariableName + '.script.js'}"),"utf-8")`)
    checks.push(`browserScriptFor_${checkVariableName}`)
    // scode += `const browserScript_${checkVariableName} =
    // fs.readFile("./browserscripts/${checkVariableName + '.js'}","utf-8")
  }
  scode += `const promises = [${readFiles.join(', \n')}]\n`
  scode += `const [${checks.join(', ')}] = await Promise.all(promises)\n`
  result.importSnippet = scode
  result.fileInfo = fileInfo
  return result
}

const groupsWithBrowserChecks = []
const browserChecksPerGroups = {}
const checkNames = {}

function pulumifyBrowserCheck (check) {
  console.log(check)
  let groupId = ''
  if (!browserChecksPerGroups[check.groupId]) {
    browserChecksPerGroups[check.groupId] = ''
  }
  if (check.groupId) {
    groupId = 'groupId: groupDefinition.id.apply(id => parseInt(id)),'
    groupsWithBrowserChecks.push(groupMap[check.groupId])
  }

  const checkCode = `
new checkly.Check("${checkNames[check.id]}", {
  name: "${check.name}",
  type: "BROWSER",
  ${frequency(check)}
  script: ${browserCheckScriptMap[check.id]},
  activated: ${check.activated},
  muted: ${check.muted},
  shouldFail: ${check.shouldFail},
  doubleCheck: ${check.doubleCheck},
  locations: ${JSON5.stringify(check.locations)},
  privateLocations: ${JSON5.stringify(check.privateLocations)},
  environmentVariables: ${JSON5.stringify(check.environmentVariables)},
  tags: ${JSON5.stringify(check.tags)},
  useGlobalAlertSettings: ${check.useGlobalAlertSettings},
  ${transformAlertSettings(check.alertSettings)}
  degradedResponseTime: ${check.degradedResponseTime},
  maxResponseTime: ${check.maxResponseTime},
  ${groupId}
  ${extractAlertSubscriberCode(check.alertChannelSubscriptions)}
  })
  `
  if (check.groupId) {
    browserChecksPerGroups[check.groupId] += (checkCode)
  } else {
    browserChecksPerGroups.__nogroup += (checkCode)
  }
  return checkCode
}

const snippetsMap = {}
let snippetCounter = 0

async function writeSnippets (basePath) {
  const allSnippets = (await getAll(snippets))
  let snippetImportCode = ''
  let snippetCode = ''
  let exportCode = '\n\nmodule.exports = {'
  await fs.mkdir(basePath, { recursive: true })
  for (const snippet of allSnippets) {
    const snippetName = `snippet${snippetCounter++}-${snakecase(snippet.name)}`
    const snippetVarName = snippetName.replace(/-/g, '_')

    const filePath = path.join(basePath, snippetVarName + '.js')
    await fs.writeFile(filePath, snippet.script)
    snippetImportCode += `
const file_${snippetVarName} = fs.readFileSync("./snippets/${snippetVarName + '.js'}","utf-8")`
    const thisSnippetCode = `
const ${snippetVarName} = new checkly.Snippet('${snippetName}', {
  name: '${snippet.name}',
  script: file_${snippetVarName}
})`
    snippetCode += thisSnippetCode
    snippetsMap[snippet.id] = snippetVarName
    exportCode += snippetVarName + ','

    importResources.resources.push({
      type: 'checkly:index/snippet:Snippet',
      id: snippet.id.toString(),
      name: snippetName,
    })
  }
  exportCode += '}'
  return snippetImportCode + snippetCode + exportCode
}

let alertChannelCounter = 0
const alertChannelMap = {}

function pulumifyAlertChannel (channel) {
  const channelName = `alert-channel-${alertChannelCounter++}-${snakecase(channel.type)}`
  const channelVariableName = channelName.replace(/-/g, '_')
  alertChannelMap[channel.id] = channelVariableName
  if (channel.type === 'EMAIL') {
    channel.config.address = 'daniel@slkjösölkj.com'
  }
  if (channel.type === 'SLACK') {
    channel.config.channel = '#froopydoopydupdup'
  }
  if (channel.type === 'OPSGENIE') {
    channel.config.apiKey = 'F5CEEBEF-ABB7-4BBA-BB6C-2E3D565B5F5B'
  }
  const channelCode = `
const ${channelVariableName} = new checkly.AlertChannel('${channelName}', {
  ${channel.type.toLowerCase()}: ${JSON5.stringify(channel.config, null, 2)},
  sendRecovery: ${channel.sendRecovery},
  sendFailure:  ${channel.sendFailure},
  sendDegraded: ${channel.sendDegraded},
  sslExpiry: ${channel.sslExpiry},
  sslExpiryThreshold: ${channel.sslExpiryThreshold}
  })
  `
  return channelCode
}

async function getAll (what) {
  const allChecks = []
  let page = 1
  while (true) {
    const { data, hasMore } = await what.getAll({ limit: 100, page: page++ })
    data.forEach(check => {
      allChecks.push(check)
    })

    if (!hasMore) {
      break
    }
  }
  return allChecks
}

async function exportMaC (options) {
  try {
    const snippetBasePath = path.join(options.basePath, 'snippets')
    const indexJsPath = path.join(options.basePath, 'index.js')
    const defaultsPath = path.join(options.basePath, 'check.defaults.js')
    const checksPath = path.join(options.basePath, 'checks')
    const fsImport = "const fs = require('fs')\n"
    const fsPromisesImport = "const fs = require('fs/promises')\n"
    const pathImport = "const path = require('path')\n"

    const allChannels = await getAll(alertChannels)

    const allGroups = await getAll(groups)

    await fs.writeFile(defaultsPath, apiDefaultsCode + requestDefaultsCode + 'module.exports = {apiCheckDefaults, apiRequestDefaults}')

    let channelCode = ''
    for (const channel of allChannels) {
      channelCode += pulumifyAlertChannel(channel)
    }

    const groupCodeMap = {}
    for (const group of allGroups) {
      const gcode = pulumifyGroup(group)
      groupCodeMap[group.id] = gcode
    }

    const snippetCode = await writeSnippets(snippetBasePath)

    const allChecks = []
    let page = 1
    while (true) {
      const { data, hasMore } = await checks.getAll({ limit: 100, page: page++ })
      data.forEach(check => {
        allChecks.push(check)
      })

      if (!hasMore) {
        break
      }
    }

    const browserChecks = allChecks.filter(x => x.checkType === 'BROWSER')
    await extractPerGroup(browserChecks, allGroups)

    browserChecksPerGroups.__nogroup = ''
    for (const browserCheck of browserChecks) {
      pulumifyBrowserCheck(browserCheck)
    }

    const apichecks = allChecks.filter(x => x.checkType === 'API')

    apiChecksPerGroup.__nogroup = ''
    for (const apicheck of apichecks) {
      pulumifyApiCheck(apicheck)
    }
    const indexJsRequire = []
    const pulumiImport = 'const checkly = require("@checkly/pulumi")\n'
    for (const entry of Object.entries(groupMap)) {
      const groupPath = path.join(checksPath, entry[1])
      await fs.mkdir(groupPath, { recursive: true })
      const group = allGroups.filter(g => g.id === parseInt(entry[0]))[0]
      indexJsRequire.push('.' + path.sep + path.relative(options.basePath, path.join(groupPath, 'group.definition.js')))
      await fs.writeFile(path.join(groupPath, 'group.definition.js'), pulumiImport + `const { ${Object.values(alertChannelMap).join(', ')} } = require('../../alertchannels.js')\n` + groupCodeMap[group.id] + `module.exports = {groupDefinition : ${entry[1]}}`)
      if (apiChecksPerGroup[group.id]) {
        indexJsRequire.push('.' + path.sep + path.relative(options.basePath, path.join(groupPath, 'api.check.definition.js')))
        let snippetsImport = ''
        if (snippetsPerGroup[group.id]) {
          snippetsImport = `const { ${snippetsPerGroup[group.id].join(',')} } = require('../../snippets.js')\n`
        }

        const importHeader = pulumiImport + "const { groupDefinition } = require('./group.definition.js')\n" +
          "const { apiCheckDefaults, apiRequestDefaults } = require('../../check.defaults.js')\n" +
          `const { ${Object.values(alertChannelMap).join(', ')} } = require('../../alertchannels.js')\n` + snippetsImport

        await fs.writeFile(path.join(groupPath, 'api.check.definition.js'), importHeader + apiChecksPerGroup[group.id])
      }
      if (browserChecksPerGroups[group.id]) {
        indexJsRequire.push('.' + path.sep + path.relative(options.basePath, path.join(groupPath, 'browser.check.definition.js')))
        const footer = 'async function load() {' + browserCheckScriptsPerGroup[group.id]?.importSnippet
        const importHeader = pulumiImport + fsPromisesImport + pathImport +
          `const { ${Object.values(alertChannelMap).join(', ')} } = require('../../alertchannels.js')\n` +
          "const { groupDefinition } = require('./group.definition.js')\n" + footer

        await fs.writeFile(path.join(groupPath, 'browser.check.definition.js'), importHeader + browserChecksPerGroups[group.id] + '}\nload()')
      }

      if (browserCheckScriptsPerGroup[group.id]) {
        const checkScripts = browserCheckScriptsPerGroup[group.id]
        await fs.mkdir(path.join(groupPath, 'scripts'), { recursive: true })
        for (const cScript of checkScripts.fileInfo) {
          await fs.writeFile(path.join(groupPath, 'scripts', cScript.filename), cScript.code)
        }
      }
    }

    if (browserChecksPerGroups.__nogroup) {
      indexJsRequire.push('.' + path.sep + 'checks/browser.check.definition.js')
      const footer = 'async function load() {' + browserCheckScriptsPerGroup.__nogroup?.importSnippet
      const importHeader = pulumiImport + fsPromisesImport + pathImport +
        `const { ${Object.values(alertChannelMap).join(', ')} } = require('../alertchannels.js')\n` + footer

      await fs.writeFile(path.join(checksPath, 'browser.check.definition.js'), importHeader + browserChecksPerGroups.__nogroup + '}\nload()')

      const checkScripts = browserCheckScriptsPerGroup.__nogroup
      await fs.mkdir(path.join(checksPath, 'scripts'), { recursive: true })
      for (const cScript of checkScripts.fileInfo) {
        await fs.writeFile(path.join(checksPath, 'scripts', cScript.filename), cScript.code)
      }
    }

    if (apiChecksPerGroup.__nogroup) {
      let snippetsImport = ''
      if (snippetsPerGroup.__nogroup) {
        snippetsImport = `const { ${snippetsPerGroup.__nogroup.join(',')} } = require('../snippets.js')\n`
      }
      const importHeader = pulumiImport + "const { apiCheckDefaults, apiRequestDefaults } = require('../check.defaults.js')\n" + snippetsImport +
        `const { ${Object.values(alertChannelMap).join(', ')} } = require('../alertchannels.js')\n`
      await fs.writeFile(path.join(checksPath, 'api.check.definition.js'), importHeader + apiChecksPerGroup.__nogroup)
      indexJsRequire.push('.' + path.sep + 'checks/api.check.definition.js')
    }

    await fs.writeFile(path.join(options.basePath, 'alertchannels.js'), pulumiImport + channelCode + `module.exports = { ${Object.values(alertChannelMap).join(', ')} }`)
    await fs.writeFile(path.join(options.basePath, 'snippets.js'), pulumiImport + fsImport + snippetCode)
    await fs.writeFile(path.join(options.basePath, 'resources.json'), JSON.stringify(importResources, null, 2))
    await fs.writeFile(indexJsPath,
      `
 ${pulumiImport}
require('./alertchannels.js')
require('./snippets.js')
 ${indexJsRequire.map(x => `require('${x}')`).join('\n')}
 `)
  } catch (err) {
    consola.error(err)
    throw err
  }
}

module.exports = exportMaC
