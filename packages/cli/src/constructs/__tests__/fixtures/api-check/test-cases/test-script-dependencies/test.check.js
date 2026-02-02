import { ApiCheck } from 'checkly/constructs'

new ApiCheck('check-setupScript', {
  name: 'Foo',
  request: {
    method: 'GET',
    url: 'https://example.org',
  },
  setupScript: {
    entrypoint: './entrypoint.js'
  }
})

new ApiCheck('check-tearDownScript', {
  name: 'Foo',
  request: {
    method: 'GET',
    url: 'https://example.org',
  },
  tearDownScript: {
    entrypoint: './entrypoint.js'
  }
})
