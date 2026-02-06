import { ApiCheck, CheckGroupV2 } from 'checkly/constructs'

const group = new CheckGroupV2('test-group', {
  name: 'Group',
})

new ApiCheck('check', {
  name: 'Foo',
  request: {
    method: 'GET',
    url: 'https://example.org',
  },
  groupId: group.ref(),
})
