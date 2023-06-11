const { CheckGroup } = require('checkly/constructs');
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
  runtimeId: '2022.10',
  locations: ['us-east-1', 'eu-west-1'],
  tags: ['mac', 'group'],
  environmentVariables: [],
  apiCheckDefaults: {},
  concurrency: 100,
  alertChannels,
});

module.exports = websiteGroup;
