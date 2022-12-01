const { CheckGroup } = require('../../../sdk/constructs')
const { EmailAlertChannel } = require('../../../sdk/constructs')

module.exports = new CheckGroup('first-group', {
  name: 'First group',
  activated: true,
  // Create logical id of filename. This is quick but the check will be recreated when the file is renamed
  pattern: 'spec.js',
  concurrency: 5,
  alertChannelSubscriptions: [new EmailAlertChannel('channel', {
    address: 'test@test.com',
  })],
})
