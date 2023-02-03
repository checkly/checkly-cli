"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var path = require("path");
var constructs_1 = require("@checkly/cli/constructs");
var alert_channels_1 = require("../alert-channels");
var alertChannels = [alert_channels_1.smsChannel, alert_channels_1.emailChannel];
/*
* In this example, we bundle all basic checks needed to check the Checkly homepage. We explicitly define the Browser
* check here, instead of using generating a default based on a .spec.js file. This allows us to override the check configuration.
* We can also add more checks into one file, in this case to cover a specific API call needed to hydrate the homepage.
*/
// We can define multiple checks in a single *.check.js file.
new constructs_1.BrowserCheck('homepage-browser-check-1', {
    name: 'Homepage',
    alertChannels: alertChannels,
    code: {
        entrypoint: path.join(__dirname, 'homepage.spec.ts')
    },
});
new constructs_1.BrowserCheck('404-browser-check-1', {
    name: '404 page',
    alertChannels: alertChannels,
    code: {
        entrypoint: path.join(__dirname, '404.spec.ts')
    },
});
