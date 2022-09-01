const consola = require('consola')
const { checks } = require('../../services/api')
const { groups } = require('../../services/api')
const { snippets } = require('../../services/api')
const { alertChannels } = require('../../services/api')

const fs = require('fs/promises')
const path = require('path')
const JSON5 = require('json5')

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
// change to
// newCheck({...defaults,
// Name:"bla",
// })
function pulumifyApiCheck (check) {
  let snippetImport = ''
  if (check.setupSnippetId != null) {
    snippetImport += `
    setupSnippetId: ${snippetsMap[check.setupSnippetId]}.id.apply(id => parseInt(id)),`
  }
  if (check.tearDownSnippetId != null) {
    snippetImport += `
    teardownSnippetId: ${snippetsMap[check.tearDownSnippetId]}.id.apply(id => parseInt(id)),`
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
new checkly.Check("check${checkCounter++}-${snakecase(check.name)}", { ...checkDefaults,
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
const checkDefaults = {
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
  alertSettings: ${JSON5.stringify(transformAlertSettings(group.alertSettings), null, 2)},
  degradedResponseTime: ${group.degradedResponseTime},
  maxResponseTime: ${group.maxResponseTime},
  ${extractAlertSubscriberCode(group.alertChannelSubscriptions)}
  })
  `
  return groupCode
}

let browserCheckCounter = 0
const browserCheckScriptMap = {}

async function extractScripts (browserChecks, scriptPath) {
  let scode = ''
  const checks = []
  const readFiles = []
  for (const bc of browserChecks) {
    const checkName = `browsercheck${browserCheckCounter++}-${snakecase(bc.name)}`
    const checkVariableName = checkName.replace(/-/g, '_')
    browserCheckScriptMap[bc.id] = 'browserScript_' + checkVariableName
    const filePath = path.join(scriptPath, checkVariableName + '.js')
    await fs.writeFile(filePath, bc.script)
    readFiles.push(`fs.readFile("./browserscripts/${checkVariableName + '.js'}","utf-8")`)
    checks.push(`browserScript_${checkVariableName}`)
    // scode += `const browserScript_${checkVariableName} =
    // fs.readFile("./browserscripts/${checkVariableName + '.js'}","utf-8")
  }
  scode += `const promises = [${readFiles.join(', \n')}]\n`
  scode += `const [${checks.join(', ')}] = await Promise.all(promises)\n`
  return scode
}

const groupsWithBrowserChecks = []

function pulumifyBrowserCheck (check) {
  console.log(check)
  let groupId = ''
  if (check.groupId) {
    groupId = `groupId: ${groupMap[check.groupId]}.id.apply(id => parseInt(id)),`
    groupsWithBrowserChecks.push(groupMap[check.groupId])
  }

  const checkCode = `
new checkly.Check("check${checkCounter++}-${snakecase(check.name)}", {
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
  alertSettings: ${JSON5.stringify(transformAlertSettings(check.alertSettings), null, 2)},
  degradedResponseTime: ${check.degradedResponseTime},
  maxResponseTime: ${check.maxResponseTime},
  ${groupId}
  ${extractAlertSubscriberCode(check.alertChannelSubscriptions)}
  })
  `
  return checkCode
}

const snippetsMap = {}
let snippetCounter = 0

async function writeSnippets (basePath) {
  const allSnippets = (await getAll(snippets))
  let snippetImportCode = ''
  let snippetCode = ''
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
  }
  return snippetImportCode + snippetCode
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
    console.log(`exporting to path: ${options.basePath}`)
    const snippetBasePath = path.join(options.basePath, 'snippets')
    const indexJsPath = path.join(options.basePath, 'index.js')
    const checksPath = path.join(options.basePath, 'checks')
    const browserCheckBasePath = path.join(options.basePath, 'browser_check_code')

    const allChannels = await getAll(alertChannels)

    const allGroups = await getAll(groups)

    let channelCode = ''
    for (const channel of allChannels) {
      channelCode += pulumifyAlertChannel(channel)
    }

    let groupCode = ''

    const groupCodeMap = {}
    for (const group of allGroups) {
      const gcode = pulumifyGroup(group)
      groupCode += gcode
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

    await fs.mkdir(browserCheckBasePath, { recursive: true })
    const browserChecks = allChecks.filter(x => x.checkType === 'BROWSER')
    const loadBrowserScripts = await extractScripts(browserChecks, browserCheckBasePath)

    let browserCheckCode = ''
    for (const browserCheck of browserChecks) {
      browserCheckCode += pulumifyBrowserCheck(browserCheck)
    }

    const apichecks = allChecks.filter(x => x.checkType === 'API')
    let apiCheckCode = ''
    for (const apicheck of apichecks) {
      apiCheckCode += pulumifyApiCheck(apicheck)
    }

    const pulumiImport = 'const checkly = require("@checkly/pulumi")\n'
    for (const entry of Object.entries(groupMap)) {
      const groupPath = path.join(checksPath, entry[1])
      await fs.mkdir(groupPath, { recursive: true })
      const group = allGroups.filter(g => g.id === parseInt(entry[0]))[0]
      await fs.writeFile(path.join(groupPath, 'group.definition.js'), pulumiImport + groupCodeMap[group.id] + `module.exports = {groupDefinition : ${entry[1]}}`)
      if (apiChecksPerGroup[group.id]) {
        const importHeader = pulumiImport + "const { groupDefinition } = require('./group.definition.js')\n"
        await fs.writeFile(path.join(groupPath, 'api.check.definition.js'), importHeader + apiChecksPerGroup[group.id])
      }
    }

    const allInOne = `
// a file that contains all definitions in one file
// delete if prefer having the resources split into multiple files
// delete everything else otherwise and rename this to index.js
const fs = require('fs')
const checkly = require("@checkly/pulumi")

${apiDefaultsCode}

${requestDefaultsCode}

${channelCode}

${snippetCode}

${loadBrowserScripts}

${groupCode}

${apiCheckCode}

${browserCheckCode}
      `
    let groupImport = ''
    if (groupsWithApiChecks.length > 0) {
      groupImport = `const { ${groupsWithApiChecks.join(', ')} } = require('./checkgroup.definitions')`
    }
    const apiCheckDefinitions = `
const checkly = require("@checkly/pulumi")
${apiDefaultsCode}
${requestDefaultsCode}

${groupImport}
    ${apiCheckCode}
    `
    groupImport = ''

    if (groupsWithBrowserChecks.length > 0) {
      groupImport = `const { ${groupsWithBrowserChecks.join(', ')} } = require('./checkgroup.definitions')`
    }

    const browserCheckDefinitions = `
const checkly = require("@checkly/pulumi")
const fs = require('fs/promises')
${groupImport}
    ${browserCheckCode}
    ${loadBrowserScripts}
    `

    const groupDefinitions = `
const checkly = require("@checkly/pulumi")
    ${groupCode}
module.exports = { ${Object.values(groupMap).join(', ')} }
    `

    await fs.writeFile(path.join(options.basePath, 'api.check.definitions.js'), apiCheckDefinitions)
    await fs.writeFile(path.join(options.basePath, 'browser.check.definitions.js'), browserCheckDefinitions)
    await fs.writeFile(path.join(options.basePath, 'checkgroup.definitions.js'), groupDefinitions)
    await fs.writeFile(path.join(options.basePath, 'index.allinone.js'), allInOne)
    await fs.writeFile(indexJsPath, allInOne)
  } catch (err) {
    consola.error(err)
    throw err
  }
}

module.exports = exportMaC
