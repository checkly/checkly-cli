import { defineConfig } from 'checkly'
import {
  AlertChannel,
  CheckGroupV2,
  EmailAlertChannel,
  PrivateLocation,
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
const plRef = PrivateLocation.fromId('070ddd08-ab58-4681-88e2-1ae955637300')

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
