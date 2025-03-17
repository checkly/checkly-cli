import { expr, ident, Program } from '../sourcegen'
import { AlertChannel, AlertChannelProps } from './alert-channel'
import { Session } from './project'

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

  source (program: Program): void {
    program.import('SlackAlertChannel', 'checkly/constructs')

    program.value(expr(ident('SlackAlertChannel'), builder => {
      builder.new(builder => {
        builder.string(this.logicalId)
        builder.object(builder => {
          builder.string('url', this.url.toString())

          if (this.channel) {
            builder.string('channel', this.channel)
          }

          this.buildSourceForAlertChannelProps(builder)
        })
      })
    }))
  }
}
