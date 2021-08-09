const DEFAULT_URL = 'https://checklyhq.com'

const settingsTemplate = ({
  accountId,
  accountName,
  projectId,
  projectName,
}) => {
  return `account:
  - id: ${accountId}
    name: ${accountName}
project:
  - id: ${projectId}
    name: ${projectName}
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

const checkTemplate = (url = DEFAULT_URL) => {
  return `type: browser
name: Browser Check #1
url: ${DEFAULT_URL}
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
environmentVariables: []
tags: []`
}

module.exports = {
  settingsTemplate,
  checkTemplate,
  defaultCheckTemplate,
}
