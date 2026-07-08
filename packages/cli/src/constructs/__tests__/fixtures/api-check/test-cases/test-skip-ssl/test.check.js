import { ApiCheck } from 'checkly/constructs'

new ApiCheck('check', {
  name: 'Skip SSL Check',
  request: {
    method: 'GET',
    // This fixture is parsed and synthesized only; it must never perform a network request.
    url: 'https://self-signed.example.test',
    skipSSL: true,
  },
})
