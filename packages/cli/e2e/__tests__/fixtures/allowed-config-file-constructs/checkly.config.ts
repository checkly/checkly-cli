import { defineConfig } from 'checkly'
import {
  AlertChannel,
  ApiCheck,
  CheckGroupV2,
  EmailAlertChannel,
  PrivateLocation,
  UrlMonitor,
} from 'checkly/constructs'

// Alert channels should be allowed when configuration is being loaded.
const ac = new EmailAlertChannel('email-alert-in-config', {
  address: 'foo@example.org',
})

// Alert channel references should be allowed.
const acRef = AlertChannel.fromId(12345)

// Private locations should be allowed.
const pl = new PrivateLocation('pl-in-config', {
  name: 'pl-in-config',
  slugName: 'pl-in-config',
})

// Private location references should be allowed.
const plRef = PrivateLocation.fromId('not-real')

// Check groups should be allowed.
const group = new CheckGroupV2('group-in-config', {
  name: 'group-in-config',
  alertChannels: [
    // Alert channel assignments should be allowed.
    ac,
    acRef,
  ],
  privateLocations: [
    // Private location assignments should be allowed.
    pl,
    plRef,
  ],
})

const config = defineConfig({
  projectName: 'config-file-constructs',
  logicalId: 'config-file-constructs',
})

export default config
