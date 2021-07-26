const settingsTemplate = ({ accountId, name, projectName }) => {
  return `account: 
  - id: ${accountId}
    name: ${name}
project: ${projectName}
checkDefaults:
  - locations: ['us-east-1', 'eu-central-1']
    interval: 5min
    alerts:
      - type: email
        sendOn:
          - recover
          - degrade
          - fail`
}

const checkTemplate = () => {
  return `type: browser
name: Example Check #1
url: https://jsonplaceholder.typicode.com/users
    `
}

const defaultCheckTemplate = () => {
  return `checkType: BROWSER
name: 'example'
frequency: 10
activated: true
muted: false
doubleCheck: true
locations:
- eu-central-1
- eu-west-3
script: |-
  const { chromium } = require("playwright")
  const expect = require("expect")

  // Start a browser session
  const browser = await chromium.launch()
  const page = await browser.newPage()

  // Go to a page. This waits till the 'load' event by default
  await page.goto("https://google.com/")

  // Assert a specific page item to be present
  const title = await page.title()
  expect(title).toBe("Google")

  // Snap a screenshot
  await page.screenshot({ path: "screen.png", fullScreen: false })

  // Close the session
  await browser.close()
alertSettings:
  muted: false
  escalationType: RUN_BASED
  runBasedEscalation:
    failedRunThreshold: 1
  timeBasedEscalation:
    minutesFailingThreshold: 5
  reminders:
    amount: 0
    interval: 5
  sslCertificates:
    enabled: true
    alertThreshold: 30
useGlobalAlertSettings: true
alertChannelSubscriptions:
- activated: true
  alertChannelId: 4
  alertChannel:
    id: 4
    type: EMAIL
    config:
      address: test2@ndo.dev
    accountId: e46106d8-e382-4d1f-8182-9d63983ed6d4
    created_at: '2021-07-01T10:22:10.559Z'
    updated_at:
    sendRecovery: true
    sendFailure: true
    sendDegraded: false
    sslExpiry: false
    sslExpiryThreshold: 30
    subscriptions:
    - id: 22
      checkId:
      alertChannelId: 4
      activated: true
      groupId: 6
      check:
      checkGroup:
        id: 6
        name: Big ol group
environmentVariables: []
tags: []
runtimeId: '2020.01'
websocketClientId: 6819de32-7723-421f-b3b1-76004c4ebfef
runLocation: eu-central-1`
}

module.exports = {
  settingsTemplate,
  checkTemplate,
  defaultCheckTemplate,
}
