import { ApiCheck } from 'checkly/constructs'

new ApiCheck('api-check-1', {
  name: 'API Check #1',
  request: {
    url: 'https://api.checklyhq.com',
    method: 'GET',
  },
  setupScript: {
    entrypoint: './setup.ts'
  }
})
