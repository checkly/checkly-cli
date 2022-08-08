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
  return {
    escalationType: settings.escalationType,
    reminders: [settings.reminders],
    runBasedEscalations: [settings.runBasedEscalations],
    timeBasedEscalations: [settings.timeBasedEscalations],
  }
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
  for (const queryParam of request.queryParameters) {
    const qp = {}
    qp[queryParam.key] = queryParam.value
    newParams.push(qp)
  }
  request.queryParameters = newParams
  request.headers = fixHeaders(request.headers)
  return request
}

let checkCounter = 0

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
    groupId = `groupId: ${groupMap[check.groupId]}.id.apply(id => parseInt(id)),`
  }

  const checkCode = `
new checkly.Check("check${checkCounter++}-${snakecase(check.name)}", {
  name: "${check.name}",
  type: "API",
  request: ${JSON5.stringify(transformRequest(check.request), null, 2)} ,
  ${frequency(check)}
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
  localSetupScript: ${JSON5.stringify(check.localSetupScript)},
  localTearDownScript: ${JSON5.stringify(check.localTearDownScript)},
  ${snippetImport}
  ${extractAlertSubscriberCode(check.alertChannelSubscriptions)}
  })
  `
  return checkCode
}

let groupCounter = 0
const groupMap = {}

function extractAlertSubscriberCode (alertChannelSubscriptions) {
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
  for (const bc of browserChecks) {
    const checkName = `browsercheck${browserCheckCounter++}-${snakecase(bc.name)}`
    const checkVariableName = checkName.replace(/-/g, '_')
    browserCheckScriptMap[bc.id] = 'browserScript_' + checkVariableName
    const filePath = path.join(scriptPath, checkVariableName + '.js')
    await fs.writeFile(filePath, bc.script)
    scode += `const browserScript_${checkVariableName} = fs.readFileSync("./browserscripts/${checkVariableName + '.js'}","utf-8")
   `
  }
  return scode
}

function pulumifyBrowserCheck (check) {
  console.log(check)
  let groupId = ''
  if (check.groupId) {
    groupId = `groupId: ${groupMap[check.groupId]}.id.apply(id => parseInt(id)),`
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
    const allChannels = await getAll(alertChannels)

    const allGroups = await getAll(groups)

    let channelCode = ''
    for (const channel of allChannels) {
      channelCode += pulumifyAlertChannel(channel)
    }

    let groupCode = ''

    for (const group of allGroups) {
      groupCode += pulumifyGroup(group)
    }

    const snippetCode = await writeSnippets('/Users/danielpaulus/tmp/pulumi-test/snippets')

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

    await fs.mkdir('/Users/danielpaulus/tmp/pulumi-test/browserscripts', { recursive: true })
    const browserChecks = allChecks.filter(x => x.checkType === 'BROWSER')
    const loadBrowserScripts = await extractScripts(browserChecks, '/Users/danielpaulus/tmp/pulumi-test/browserscripts')

    let browserCheckCode = ''
    for (const browserCheck of browserChecks) {
      browserCheckCode += pulumifyBrowserCheck(browserCheck)
    }

    const apichecks = allChecks.filter(x => x.checkType === 'API')
    let apiCheckCode = ''
    for (const apicheck of apichecks) {
      apiCheckCode += pulumifyApiCheck(apicheck)
    }

    const content = `
const fs = require('fs')
const checkly = require("@checkly/pulumi")
${channelCode}

${snippetCode}

${loadBrowserScripts}

${groupCode}

${apiCheckCode}

${browserCheckCode}
      `
    await fs.writeFile('/Users/danielpaulus/tmp/pulumi-test/index.js', content)
  } catch (err) {
    consola.error(err)
    throw err
  }
}

module.exports = exportMaC
