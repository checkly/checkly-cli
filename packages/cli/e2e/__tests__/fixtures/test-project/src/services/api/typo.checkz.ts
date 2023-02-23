import { ApiCheck } from '@checkly/cli/constructs'

const apiCheck = new ApiCheck('not-included-typo-api-check-1', {
  name: 'File extension type example',
  request: {
    url: 'https://api.checklyhq.com/public-stats',
    method: 'GET',
    assertions: [],
  },
})
