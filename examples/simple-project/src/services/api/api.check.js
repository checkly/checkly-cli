"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var constructs_1 = require("@checkly/cli/dist/constructs");
var alert_channels_1 = require("../../alert-channels");
new constructs_1.ApiCheck('homepage-api-check-1', {
    name: 'Homepage - fetch stats',
    alertChannels: [alert_channels_1.slackChannel, alert_channels_1.webhookChannel],
    degradedResponseTime: 10000,
    maxResponseTime: 20000,
    request: {
        url: 'https://api.checklyhq.com/public-stats',
        method: 'GET',
        followRedirects: true,
        skipSsl: false,
        assertions: [
            { source: 'STATUS_CODE', property: '', comparison: 'EQUALS', target: '200', regex: '' },
            { source: 'JSON_BODY', regex: '', property: '$.apiCheckResults', comparison: 'GREATER_THAN', target: '0' }
        ],
    }
});
