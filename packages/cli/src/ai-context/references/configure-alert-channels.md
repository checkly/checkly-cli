# Alert Channels

- Alert channels are used to send notifications when checks and monitors fail or recover.
- Alert channels are added to checks, monitors, and check groups constructs by adding them to the `alertChannels` array property.

Here are some examples of how to create different types of alert channels.

All available alerts are described in the [Checkly docs](https://www.checklyhq.com/docs/constructs/overview/).

*Important*: Don't make up email addresses, phone numbers, Slack URLs or similar static values. Scan the project to discover a valid configuration or ask what the values should be.

## Email Alert Channel

<!-- EXAMPLE: EMAIL_ALERT_CHANNEL -->

## Phone Call Alert Channel

<!-- EXAMPLE: PHONE_CALL_ALERT_CHANNEL -->

## Slack Alert Channel

<!-- EXAMPLE: SLACK_ALERT_CHANNEL -->
