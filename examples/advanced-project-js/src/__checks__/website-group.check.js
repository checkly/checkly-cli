const { CheckGroup, RetryStrategyBuilder } = require('checkly/constructs');
const { smsChannel, emailChannel } = require('../alert-channels');
const alertChannels = [smsChannel, emailChannel];
/*
 * In this example, we bundle checks using a Check Group. We add checks to this group in two ways:
 * 1. By passing the `CheckGroup` object for the `group` property of the check.
 * 2. By defining a glob pattern like `*.spec.js` that matches Browser Checks , just like at the Project level, e.g.
 *
 *  browserChecks: {
 *    testMatch: './*.spec.js'
 *  }
 *
 * You can use either or both. In this example we show option 1.
 **/

const websiteGroup = new CheckGroup('website-check-group-1', {
  name: 'Website Group',
  activated: true,
  muted: false,
  runtimeId: '2024.02',
  locations: ['us-east-1', 'eu-west-1'],
  tags: ['mac', 'group'],
  environmentVariables: [],
  apiCheckDefaults: {},
  concurrency: 100,
  alertChannels,
  /*
   * Failed check runs in this group will be retried before triggering alerts.
   * The wait time between retries will increase linearly: 30 seconds, 60 seconds, and then 90 seconds between the retries.
   */
  retryStrategy: RetryStrategyBuilder.linearStrategy({ baseBackoffSeconds: 30, maxRetries: 3, sameRegion: false }),
  runParallel: true,
});

module.exports = { websiteGroup };
