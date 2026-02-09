import { ApiCheck } from 'checkly/constructs'

new ApiCheck('check-should-have-defaults', {
  name: 'Foo',
  request: {
    method: 'GET',
    url: 'https://example.org',
  },
})

new ApiCheck('check-should-not-have-defaults', {
  name: 'Foo',
  request: {
    method: 'GET',
    url: 'https://example.org',
  },
  tags: ['not default tags'],
})
