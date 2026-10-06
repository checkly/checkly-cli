/* eslint-disable */
import { MaintenanceWindow } from 'checkly/constructs'
new MaintenanceWindow('maintenance-window-1', {
  name: 'My maintenance window',
  tags: ['production', 'api'],
  startsAt: new Date(),
  endsAt: new Date(new Date().valueOf() + (1 * 60 * 60 * 1000)), // a hour from now
  repeatInterval: 1,
  repeatUnit: 'MONTH',
  repeatEndsAt: new Date(new Date().valueOf() + (2160 * 60 * 60 * 1000)), // ~three months from now
  // The window starts now, so it is active when redeployed; the API rejects timezone changes on an
  // active window, so this value must stay the same across deploys.
  timezone: 'Europe/Berlin',
})
