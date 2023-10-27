import * as path from 'path'
import { MultiStepCheck } from 'checkly/constructs'
import { smsChannel, emailChannel } from '../alert-channels'

const alertChannels = [smsChannel, emailChannel]

/*
* In this example, we bundle all basic checks needed to check the Checkly homepage. We explicitly define the Browser
* check here, instead of using a default based on a .spec.js file. This allows us to override the check configuration.
* We can also add more checks into one file, in this case to cover a specific API call needed to hydrate the homepage.
*/

// We can define multiple checks in a single *.check.ts file.
new MultiStepCheck('spacex-multistep-check', {
  name: 'SpaceX MS',
  runtimeId: '2023.09',
  alertChannels,
  code: {
    entrypoint: path.join(__dirname, 'spacex-requests.spec.ts')
  },
})
