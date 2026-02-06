import { BrowserCheck } from 'checkly/constructs'

new BrowserCheck('check', {
  name: 'Foo',
  runtimeId: '9999.99',
  code: {
    content: 'console.log()',
  },
})
