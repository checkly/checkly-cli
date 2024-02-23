const path = require('path');
const { BrowserCheck } = require('checkly/constructs');
const { smsChannel, emailChannel } = require('../alert-channels');
const { websiteGroup } = require('./website-group.check');

const alertChannels = [smsChannel, emailChannel];

/*
 * In this example, we bundle all basic checks needed to check the Checkly homepage. We explicitly define the Browser
 * check here, instead of using a default based on a .spec.js file. This allows us to override the check configuration.
 * We can also add more checks into one file, in this case to cover a specific API call needed to hydrate the homepage.
 */

// We can define multiple checks in a single *.check.js file.
new BrowserCheck('homepage-browser-check', {
  name: 'Home page',
  alertChannels,
  group: websiteGroup,
  code: {
    entrypoint: path.join(__dirname, 'homepage.spec.js'),
  },
  runParallel: true,
});

new BrowserCheck('login-browser-check', {
  name: 'Login Check',
  alertChannels,
  group: websiteGroup,
  code: {
    entrypoint: path.join(__dirname, 'login.spec.js'),
  },
  runParallel: true,
});
