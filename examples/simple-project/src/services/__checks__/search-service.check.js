const path = require('path')
const { BrowserCheck } = require('@checkly/cli/constructs')

/*
* Rather than create an automatic check for `search-service.spec.js`, we explicitly define a check here.
* This allows us to override the check configuration.
*/
new BrowserCheck('search-service-check', {
  name: 'Search Service',
  code: {
    entrypoint: path.join(__dirname, 'search-service.spec.js')
  },
})

// We can define multiple checks in a single *.check.js file.
new BrowserCheck('search-selection-check', {
  name: 'Search Selection',
  code: {
    entrypoint: path.join(__dirname, 'search-selection.spec.js')
  },
})
