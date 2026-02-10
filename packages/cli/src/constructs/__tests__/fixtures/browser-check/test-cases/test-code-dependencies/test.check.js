import { BrowserCheck } from 'checkly/constructs'

new BrowserCheck('check', {
  name: 'Foo',
  code: {
    entrypoint: './entrypoint.js'
  }
})
