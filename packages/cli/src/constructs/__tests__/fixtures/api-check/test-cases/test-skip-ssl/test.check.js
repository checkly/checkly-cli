import { ApiCheck } from 'checkly/constructs'

new ApiCheck('check', {
  name: 'Skip SSL Check',
  request: {
    method: 'GET',
    url: 'https://self-signed.example.test',
    skipSSL: true,
  },
})
