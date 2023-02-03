"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.webhookChannel = exports.slackChannel = exports.emailChannel = exports.smsChannel = void 0;
var node_url_1 = require("node:url");
var constructs_1 = require("@checkly/cli/constructs");
var sendDefaults = {
    sendFailure: true,
    sendRecovery: true,
    sendDegraded: false,
    sslExpiry: true,
    sslExpiryThreshold: 30
};
exports.smsChannel = new constructs_1.SmsAlertChannel('sms-channel-1', __assign({ phoneNumber: '0031061234567890' }, sendDefaults));
exports.emailChannel = new constructs_1.EmailAlertChannel('email-channel-1', __assign({ address: 'alerts@acme.com' }, sendDefaults));
exports.slackChannel = new constructs_1.SlackAlertChannel('slack-channel-1', __assign({ url: new node_url_1.URL('https://hooks.slack.com/services/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'), channel: '#ops' }, sendDefaults));
exports.webhookChannel = new constructs_1.WebhookAlertChannel('webhook-channel-1', __assign({ name: 'Pushover webhook', method: 'POST', url: new node_url_1.URL('https://webhook.site/ddead495-8b15-4b0d-a25d-f6cda4144dc7'), template: "{\n    \"token\":\"FILL_IN_YOUR_SECRET_TOKEN_FROM_PUSHOVER\",\n    \"user\":\"FILL_IN_YOUR_USER_FROM_PUSHOVER\",\n    \"title\":\"{{ALERT_TITLE}}\",\n    \"html\":1,\n    \"priority\":2,\n    \"retry\":30,\n    \"expire\":10800,\n    \"message\":\"{{ALERT_TYPE}} {{STARTED_AT}} ({{RESPONSE_TIME}}ms) {{RESULT_LINK}}\"\n  }" }, sendDefaults));
