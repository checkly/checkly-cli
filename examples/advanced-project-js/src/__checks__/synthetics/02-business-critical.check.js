const path = require('path');
const { BrowserCheck } = require('checkly/constructs');
const { syntheticGroup } = require('../utils/website-groups.check');

// Configures two checks for our homepage in a single configuration file.
// Most settings for these checks are defined in the check group,
// in /utils/website-groups.check.ts

new BrowserCheck('browse-and-search-check', {
  name: 'Browse and search',
  group: syntheticGroup,
  code: {
    entrypoint: path.join(__dirname, '03-browse-and-search.spec.js')
  },
  runParallel: true,
})

new BrowserCheck('login-browser-check', {
  name: 'Add to cart flow',
  group: syntheticGroup,
  code: {
    entrypoint: path.join(__dirname, '04-add-to-cart.spec.js')
  },
  runParallel: true,
})
