const { BrowserCheck } = require('@checkly/cli/constructs')
new BrowserCheck('browser-check', {
  name: 'Browser Check',
  code: {
    entrypoint: 'entrypoint.js',
  },
})