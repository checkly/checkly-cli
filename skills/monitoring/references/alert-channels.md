# Alert Channels

- Alert channels are used to send notifications when checks and monitors fail or recover.
- Alert channels are added to checks, monitors, and check groups constructs by adding them to the `alertChannels` array property.

Here are some examples of how to create different types of alert channels.

All available alerts are described in the [Checkly docs](https://www.checklyhq.com/docs/constructs/overview/).

## Email Alert Channel

**Reference:** https://www.checklyhq.com/docs/constructs/email-alert-channel/

```typescript
import { EmailAlertChannel } from 'checkly/constructs'

export const testEmailAlert = new EmailAlertChannel('example-email-alert-channel', {
  address: 'test@example.com',
  sslExpiry: true,
})
```

## Phone Call Alert Channel

**Reference:** https://www.checklyhq.com/docs/constructs/phone-call-alert-channel/

```typescript
import { PhoneCallAlertChannel } from 'checkly/constructs'

export const testUserPhoneCallAlert = new PhoneCallAlertChannel('example-call-alert-channel', {
  name: 'Test User',
  phoneNumber: '+311234567890',
})
```

## Slack Alert Channel

**Reference:** https://www.checklyhq.com/docs/constructs/slack-alert-channel/

```typescript
import { SlackAlertChannel } from 'checkly/constructs'

export const generalSlackAlert = new SlackAlertChannel('example-slack-alert-channel', {
  url: 'https://hooks.slack.com/services/TK123456789123/12345/123456789',
  channel: '#general',
})
```
