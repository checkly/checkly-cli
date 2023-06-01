/* eslint-disable no-new */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { BrowserCheck } = require('checkly/constructs')
new BrowserCheck('browser-check', {
  name: 'Browser Check',
  code: {
    entrypoint: 'entrypoint.js',
  },
})
