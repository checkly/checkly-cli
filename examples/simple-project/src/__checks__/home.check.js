const path = require('path')
const { BrowserCheck, ApiCheck } = require('@checkly/cli/constructs')
const { smsChannel, emailChannel } = require('../alert-channels')
const alertChannels = [smsChannel, emailChannel]
/*
* In this example, we bundle all basic checks needed to check the Checkly homepage. We explicitly define the Browser
* check here, instead of using generating a default based on a .spec.js file. This allows us to override the check configuration.
* We can also add more checks into one file, in this case to cover a specific API call needed to hydrate the homepage.
*/

// We can define multiple checks in a single *.check.js file.
new BrowserCheck('homepage-browser-check-1', {
  name: 'Homepage',
  alertChannels,
  code: {
    entrypoint: path.join(__dirname, 'homepage.spec.js')
  },
})

new BrowserCheck('404-browser-check-1', {
  name: '404 page',
  alertChannels,
  code: {
    entrypoint: path.join(__dirname, '404.spec.js')
  },
})
