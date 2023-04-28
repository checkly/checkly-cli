const { BrowserCheck } = require('checkly/constructs')
new BrowserCheck('browser-check', {
  name: 'Browser Check',
  code: {
    entrypoint: 'entrypoint.js',
  },
})