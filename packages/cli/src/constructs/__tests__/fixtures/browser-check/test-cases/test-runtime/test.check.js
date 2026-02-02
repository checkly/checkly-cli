import { BrowserCheck } from 'checkly/constructs'

new BrowserCheck('check-with-runtime', {
  name: 'Foo',
  code: {
    content: 'console.log()',
  },
  runtimeId: '2025.04',
})

new BrowserCheck('check-without-runtime', {
  name: 'Foo',
  code: {
    content: 'console.log()',
  },
})
