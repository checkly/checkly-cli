"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var constructs_1 = require("@checkly/cli/constructs");
var alert_channels_1 = require("../alert-channels");
var alertChannels = [alert_channels_1.smsChannel, alert_channels_1.emailChannel];
/*
* In this example, we bundle checks using a Check Group. We add checks to this group in two ways:
* 1. By calling the ref() method for the groupId property of the check.
* 2. By defining a glob pattern that matches browser checks using *.spec.js.
*
* You can use either or both.
*/
// We can define multiple checks in a single *.check.js file.
var group = new constructs_1.CheckGroup('check-group-1', {
    name: 'Group',
    activated: true,
    muted: false,
    runtimeId: '2022.10',
    locations: ['us-east-1', 'eu-west-1'],
    tags: ['mac', 'group'],
    environmentVariables: [],
    apiCheckDefaults: {},
    browserCheckDefaults: {},
    concurrency: 100,
    alertChannels: alertChannels,
    browserChecks: {
        testMatch: '*.spec.ts'
    }
});
new constructs_1.ApiCheck('check-group-api-check-1', {
    name: 'Homepage - fetch stats',
    groupId: group.ref(),
    degradedResponseTime: 10000,
    maxResponseTime: 20000,
    request: {
        method: 'GET',
        url: 'https://api.checklyhq.com/public-stats',
        followRedirects: true,
        skipSsl: false,
        assertions: []
    }
});
