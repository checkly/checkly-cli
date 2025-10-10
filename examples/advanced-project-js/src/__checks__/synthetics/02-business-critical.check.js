const { join } = require('path')
const { BrowserCheck } = require('checkly/constructs')
const { syntheticGroup } = require('../utils/website-groups.check')

// Configures two checks for our homepage in a single configuration file.
// Most settings for these checks are defined in the check group,
// in /utils/website-groups.check.ts

new BrowserCheck('browse-and-search-check', {
  name: 'Browse and Search',
  group: syntheticGroup,
  code: {
    entrypoint: join(__dirname, '03-browse-and-search.spec.js')
  },
  runParallel: true,
})

new BrowserCheck('login-browser-check', {
  name: 'Login',
  group: syntheticGroup,
  code: {
    entrypoint: join(__dirname, '04-login.spec.js')
  },
  runParallel: true,
})
