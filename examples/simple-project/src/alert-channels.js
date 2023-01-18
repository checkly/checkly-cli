const {
  SmsAlertChannel,
  EmailAlertChannel,
  SlackAlertChannel,
  WebhookAlertChannel
} = require('@checkly/cli/constructs')

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

const slackChannel = new SlackAlertChannel('slack-channel-1', {
  name: 'Slack channel',
  url: 'https://hooks.slack.com/services/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',
  channel: '#ops'

})

const webhookChannel = new WebhookAlertChannel('webhook-channel-1', {
  name: 'Pushover webhook',
  method: 'POST',
  url: 'https://webhook.site/ddead495-8b15-4b0d-a25d-f6cda4144dc7',
  template: `{
    "token":"FILL_IN_YOUR_SECRET_TOKEN_FROM_PUSHOVER",
    "user":"FILL_IN_YOUR_USER_FROM_PUSHOVER",
    "title":"{{ALERT_TITLE}}",
    "html":1,
    "priority":2,
    "retry":30,
    "expire":10800,
    "message":"{{ALERT_TYPE}} {{STARTED_AT}} ({{RESPONSE_TIME}}ms) {{RESULT_LINK}}"
  }`
})

module.exports = {
  smsChannel,
  emailChannel,
  slackChannel,
  webhookChannel
}
