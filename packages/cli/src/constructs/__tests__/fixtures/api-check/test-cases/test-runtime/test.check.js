import { ApiCheck } from 'checkly/constructs'

new ApiCheck('check-with-runtime', {
  name: 'Foo',
  request: {
    method: 'GET',
    url: 'https://example.org',
  },
  runtimeId: '2025.04',
  setupScript: {
    content: 'console.log()',
  },
})

new ApiCheck('check-without-runtime', {
  name: 'Foo',
  request: {
    method: 'GET',
    url: 'https://example.org',
  },
  setupScript: {
    content: 'console.log()',
  },
})
