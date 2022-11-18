import { Project, Check, AlertChannel } from './sdk/types'
import { join } from 'path'

const alert = new AlertChannel({
  type: 'EMAIL',
  config: {
    address: 'test@test.com'
  },
  sslExpiry: false,
  sslExpiryThreshold: 30
})

// Creating a check manually
const check = new Check({
  name: 'A check',
  // We parse the files and populate script and dependencies fields ourselves
  entry: join(__dirname, 'dir/test.spec.js'),
  alertChannels: [alert]
})

const project = new Project('sampleProject')

project.addAlertChannel('example_channel', alert)
project.addCheck('example_check', check)

export default project
