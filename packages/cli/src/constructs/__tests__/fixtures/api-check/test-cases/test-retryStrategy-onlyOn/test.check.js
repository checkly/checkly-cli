import { ApiCheck, RetryStrategyBuilder } from 'checkly/constructs'

new ApiCheck('check', {
  name: 'Foo',
  request: {
    method: 'GET',
    url: 'https://example.org',
  },
  retryStrategy: RetryStrategyBuilder.linearStrategy({
    onlyOn: 'NETWORK_ERROR',
  })
})
