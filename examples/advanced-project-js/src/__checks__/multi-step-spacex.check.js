const path = require('path')
const { MultiStepCheck } = require('checkly/constructs')
const { smsChannel, emailChannel } = require('../alert-channels')

const alertChannels = [smsChannel, emailChannel]

/*
* In this example, we utilize the SpaceX public API to construct a series of chained requests, with the goal of confirming
* that the capsules retrieved from the main endpoint match those obtained from the individual capsule endpoint.
* Read more in our documentation https://www.checklyhq.com/docs/multistep-checks/
*/

// We can define multiple checks in a single *.check.js file.
new MultiStepCheck('spacex-multistep-check', {
  name: 'SpaceX MS',
  runtimeId: '2024.02',
  alertChannels,
  code: {
    entrypoint: path.join(__dirname, 'spacex-requests.spec.js')
  },
  runParallel: true,
})
