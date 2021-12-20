const DEFAULT_URL = 'https://checklyhq.com'
const DEFAULT_TITLE = 'Delightful Active Monitoring for Developers'
const DEFAULT_LOCATIONS = ['us-east-1', 'eu-west-1']
const DEFAULT_FREQUENCY = 10
const DEFAULT_NAME = 'Browser Check'

module.exports = {
  basic: ({
    name = DEFAULT_NAME,
    url = DEFAULT_URL,
    title = DEFAULT_TITLE,
    locations = DEFAULT_LOCATIONS,
    frequency = DEFAULT_FREQUENCY
  } = {}) => {
    return `checkType: BROWSER
name: ${name}
activated: true
frequency: ${frequency}
locations:
  - ${locations.join('\n  - ')}
script: |-
  const { chromium } = require("playwright")
  const expect = require("expect")

  // Start a browser session
  const browser = await chromium.launch()
  const page = await browser.newPage()

  // Go to a page. This waits till the 'load' event by default
  await page.goto("${url}")

  // Assert a specific page item to be present
  const title = await page.title()
  expect(title).toBe("${title}")

  // Close the session
  await browser.close()`
  },

  advanced: ({
    name = DEFAULT_NAME,
    url = DEFAULT_URL,
    title = DEFAULT_TITLE,
    locations = DEFAULT_LOCATIONS,
    frequency = DEFAULT_FREQUENCY
  } = {}) => {
    return `checkType: BROWSER
name: ${name}
frequency: ${frequency}
activated: true
muted: false
doubleCheck: true
locations:
  - ${locations.join('\n  - ')}
script: |-
  const { chromium } = require("playwright")
  const expect = require("expect")

  // Start a browser session
  const browser = await chromium.launch()
  const page = await browser.newPage()

  // Go to a page. This waits till the 'load' event by default
  await page.goto("${url}")

  // Assert a specific page item to be present
  const title = await page.title()
  expect(title).toBe(${title}")

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
}
