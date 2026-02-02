import { BrowserCheck, CheckGroupV2 } from 'checkly/constructs'

const group = new CheckGroupV2('test-group', {
  name: 'Group',
})

new BrowserCheck('check', {
  name: 'Foo',
  code: {
    content: 'console.log()',
  },
  group,
})
