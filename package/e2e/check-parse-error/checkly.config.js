const { constructs } = require('@checkly/cli')
const { BrowserCheck } = constructs

new BrowserCheck('browser-check', {
  name: 'Browser Check',
  code: {
    entrypoint: 'entrypoint.js',
  },
})