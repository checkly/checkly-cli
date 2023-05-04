const { CheckGroup } = require('../../../../../constructs')

new CheckGroup('check-group-test', {
  name: 'CheckGroup',
  locations: ['eu-central-1'],
})
