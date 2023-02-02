const path = require('path')
const { BrowserCheck } = require('../../../../../../constructs')

new BrowserCheck('check-2', {
  name: 'Search Service Check',
  code: {
    entrypoint: path.join(__dirname, 'search-service.spec.js'),
  }
})
