/* eslint-disable no-new */
import { BrowserCheck, CheckGroup } from '../../../../../constructs'

const group = new CheckGroup('check-group-1', {
  name: 'group',
  environmentVariables: [{ key: 'FOO', value: 'bar' }, { key: 'EMPTY_FOO', value: '' }],
})

new BrowserCheck('check-1', {
  name: 'login check',
  locations: ['eu-central-1'],
  frequency: 10,
  group,
  code: {
    content: 'console.log("performing login")',
  },
})
