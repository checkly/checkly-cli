const { join } = require('path')
const { BrowserCheck } = require('checkly/constructs')
const { syntheticGroup } = require('../utils/website-groups.check')

// Even though there are multiple test() function calls in the .spec
// file, they will all run and report as a single Checkly monitor.
// Since one of the tests compares a current screenshot to a stored one,
// this check is deactivated, until you a store a known good screenshot.
// Run `npx checkly test --update-snapshots` before activiating this check.

new BrowserCheck('playwright-techniques', {
  name: 'Playwright techniques demo',
  group: syntheticGroup,
  activated: false,
  code: {
    entrypoint: join(__dirname, '07-playwright-techniques.spec.js')
  },
  runParallel: true,
})
