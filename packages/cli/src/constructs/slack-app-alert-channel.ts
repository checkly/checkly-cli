import { AlertChannel, AlertChannelProps } from './alert-channel.js'
import { Diagnostics, ErrorDiagnostic } from './diagnostics.js'
import { Session } from './session.js'

const SLACK_INTEGRATION = 'SLACK'

export interface SlackAppAlertChannelProps extends AlertChannelProps {
  /**
   * List of Slack #channels or @handles to notify.
   * Private channels require the Checkly app to be invited first.
   * @example
   * ['#alerts', '#ops', '@alice']
   */
  slackChannels: string[]
}

/**
 * Creates a Checkly Slack App Alert Channel
 *
 * @remarks
 *
 * This class make use of the Alert Channel endpoints.
 */
export class SlackAppAlertChannel extends AlertChannel {
  slackChannels: string[]
  /**
   * Constructs the Slack App Alert Channel instance
   *
   * @param logicalId unique project-scoped resource name identification
   * @param props Slack App alert channel configuration properties
   *
   * {@link https://www.checklyhq.com/docs/constructs/slack-app-alert-channel/ Read more in the docs}
   */
  constructor (logicalId: string, props: SlackAppAlertChannelProps) {
    super(logicalId, props)
    this.slackChannels = props.slackChannels
    Session.registerConstruct(this)
  }

  describe (): string {
    return `SlackAppAlertChannel:${this.logicalId}`
  }

  /**
   * Refuses the channel when the account has no Checkly Slack app: its alerts
   * cannot be delivered, whether the channel is new or was deployed before the
   * app was disconnected. Skipped when the account's integrations are unknown.
   */
  async validate (diagnostics: Diagnostics): Promise<void> {
    await super.validate(diagnostics)

    const connected = Session.accountConnectedIntegrations
    if (connected === undefined || connected.includes(SLACK_INTEGRATION) || !this.slackChannels?.length) {
      return
    }
    const error = new Error(
      `SlackAppAlertChannel '${this.logicalId}' needs the Checkly Slack app, which is not connected to this account,`
      + ` so its alerts cannot be delivered.`,
    )
    diagnostics.add(new ErrorDiagnostic({
      title: 'Checkly Slack app not connected',
      message:
        `${error.message}\n\n`
        + `Hint: Connect the Checkly Slack app at`
        + ` https://app.checklyhq.com/accounts/${Session.accountId}/settings/account/integrations,`
        + ` or remove the channel.`,
      error,
    }))
  }

  synthesize () {
    return {
      ...super.synthesize(),
      type: 'SLACK_APP',
      config: {
        slackChannels: this.slackChannels,
      },
    }
  }
}
