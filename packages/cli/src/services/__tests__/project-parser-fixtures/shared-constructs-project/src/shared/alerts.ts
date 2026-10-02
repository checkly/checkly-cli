import { CheckGroupV2, EmailAlertChannel } from 'checkly/constructs'

// Not matched by the check glob; only reached through the check files that
// import it.
export const ops = new EmailAlertChannel('ops', {
  address: 'ops@example.com',
})

export const group = new CheckGroupV2('shared-group', {
  name: 'Shared group',
})
