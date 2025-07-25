import { AlertChannel, AlertChannelProps } from './alert-channel'
import { Session } from './project'
import { Diagnostics } from './diagnostics'
import { InvalidPropertyValueDiagnostic } from './construct-diagnostics'

export interface SlackAlertChannelProps extends AlertChannelProps {
  url: URL|string
  channel?: string
}

/**
 * Creates an Slack Alert Channel
 *
 * @remarks
 *
 * This class make use of the Alert Channel endpoints.
 */
export class SlackAlertChannel extends AlertChannel {
  url: URL|string
  channel?: string
  /**
   * Constructs the Slack Alert Channel instance
   *
   * @param logicalId unique project-scoped resource name identification
   * @param props Slack alert channel configuration properties
   *
   * {@link https://checklyhq.com/docs/cli/constructs-reference/#slackalertchannel Read more in the docs}
   */
  constructor (logicalId: string, props: SlackAlertChannelProps) {
    super(logicalId, props)
    this.url = props.url
    this.channel = props.channel
    Session.registerConstruct(this)
  }

  describe (): string {
    return `SlackAlertChannel:${this.logicalId}`
  }

  async validate (diagnostics: Diagnostics): Promise<void> {
    await super.validate(diagnostics)

    // Validate Slack webhook URL
    if (this.url) {
      const urlString = this.url instanceof URL ? this.url.toString() : this.url
      try {
        const url = new URL(urlString)
        // Validate it's a Slack webhook URL
        if (!url.hostname.includes('slack.com')) {
          diagnostics.add(new InvalidPropertyValueDiagnostic(
            'url',
            new Error(`URL must be a valid Slack webhook URL. Current value: "${urlString}"`),
          ))
        }
      } catch {
        diagnostics.add(new InvalidPropertyValueDiagnostic(
          'url',
          new Error(`Invalid URL format: "${urlString}". Must be a valid URL.`),
        ))
      }
    }

    // Validate Slack channel format (optional)
    if (this.channel) {
      const channelRegex = /^[#@][\w-]+$/
      if (!channelRegex.test(this.channel)) {
        diagnostics.add(new InvalidPropertyValueDiagnostic(
          'channel',
          new Error(`Invalid Slack channel format: "${this.channel}". Must start with # or @ followed by alphanumeric characters, hyphens or underscores.`),
        ))
      }
    }
  }

  synthesize () {
    return {
      ...super.synthesize(),
      type: 'SLACK',
      config: {
        url: this.url,
        channel: this.channel,
      },
    }
  }
}
