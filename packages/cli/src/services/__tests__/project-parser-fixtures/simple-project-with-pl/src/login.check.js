/* eslint-disable no-new */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { BrowserCheck, PrivateLocation, CheckGroup } = require('../../../../../constructs')

const privateLocation = new PrivateLocation('private-location-1', {
  name: 'My Private Location',
  slugName: 'my-private-location-1',
})

new CheckGroup('group-1', {
  name: 'login check',
  locations: ['eu-central-1'],
  privateLocations: [privateLocation, 'my-external-private-location'],
})

new BrowserCheck('browser-check-1', {
  name: 'login check',
  locations: ['eu-central-1'],
  frequency: 10,
  privateLocations: [privateLocation, 'my-external-private-location'],
  code: {
    content: 'console.log("performing login")',
  },
})
