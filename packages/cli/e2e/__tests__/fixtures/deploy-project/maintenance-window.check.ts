/* eslint-disable */
import { MaintenanceWindow } from 'checkly/constructs'

// The API rejects date changes on an active window (compared at minute precision), so a
// redeploy must send the same dates. The e2e harness fixes FIXTURE_NOW once per test file.
const now = process.env.FIXTURE_NOW ? new Date(process.env.FIXTURE_NOW).valueOf() : Date.now()

new MaintenanceWindow('maintenance-window-1', {
  name: 'My maintenance window',
  tags: ['production', 'api'],
  startsAt: new Date(now),
  endsAt: new Date(now + (1 * 60 * 60 * 1000)), // an hour from now
  repeatInterval: 1,
  repeatUnit: 'MONTH',
  repeatEndsAt: new Date(now + (2160 * 60 * 60 * 1000)), // ~three months from now
  // The window starts now, so it is active when redeployed; the API rejects timezone changes on an
  // active window, so this value must stay the same across deploys.
  timezone: 'Europe/Berlin',
})
