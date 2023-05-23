import { ApiCheck } from 'checkly/constructs'

const apiCheck = new ApiCheck('not-included-typo-api-check-1', {
  name: 'File extension type example',
  request: {
    url: 'https://api.checklyhq.com/v1/runtimes',
    method: 'GET',
    assertions: [],
  },
})
