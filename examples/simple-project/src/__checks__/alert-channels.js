const { SmsAlertChannel, EmailAlertChannel } = require('@checkly/cli/constructs')

const sendDefaults = {
  sendFailure: true,
  sendRecovery: true,
  sendDegraded: false,
}

const smsChannel = new SmsAlertChannel('sms-channel-1', {
  phoneNumber: '0031061234567890',
  ...sendDefaults
})

const emailChannel = new EmailAlertChannel('email-channel-1', {
  address: 'alerts@acme.com',
  ...sendDefaults
})

module.exports = {
  smsChannel,
  emailChannel
}
