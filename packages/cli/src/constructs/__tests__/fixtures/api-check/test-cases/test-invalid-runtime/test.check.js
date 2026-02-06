import { ApiCheck } from 'checkly/constructs'

new ApiCheck('check', {
  name: 'Foo',
  request: {
    method: 'GET',
    url: 'https://example.org',
  },
  runtimeId: '9999.99',
  setupScript: {
    content: 'console.log()',
  },
})
