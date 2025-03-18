import { decl, expr, ident, Program } from '../sourcegen'
import { AlertChannel, AlertChannelProps } from './alert-channel'
import { Session } from './project'

export interface SmsAlertChannelProps extends AlertChannelProps {
  /**
   * The phone number where to send the alert notifications.
   */
  phoneNumber: string
  /**
   * The name of the alert channel.
   */
  name?: string;
}

/**
 * Creates a SMS Alert Channel
 *
 * @remarks
 *
 * This class make use of the Alert Channel endpoints.
 */
export class SmsAlertChannel extends AlertChannel {
  phoneNumber: string
  name?: string
  /**
   * Constructs the SMS Alert Channel instance
   *
   * @param logicalId unique project-scoped resource name identification
   * @param props SMS alert channel configuration properties
   *
   * {@link https://checklyhq.com/docs/cli/constructs-reference/#smsalertchannel Read more in the docs}
   */
  constructor (logicalId: string, props: SmsAlertChannelProps) {
    super(logicalId, props)
    this.phoneNumber = props.phoneNumber
    this.name = props.name
    Session.registerConstruct(this)
  }

  synthesize () {
    return {
      ...super.synthesize(),
      type: 'SMS',
      config: {
        number: this.phoneNumber,
        name: this.name,
      },
    }
  }

  source (program: Program): void {
    program.import('SmsAlertChannel', 'checkly/constructs')

    const id = program.registerVariable(
      `SmsAlertChannel::${this.logicalId}`,
      ident(program.nth('smsAlertChannel')),
    )

    program.section(decl(id, builder => {
      builder.variable(expr(ident('SmsAlertChannel'), builder => {
        builder.new(builder => {
          builder.string(this.logicalId)
          builder.object(builder => {
            if (this.name) {
              builder.string('name', this.name)
            }

            builder.string('phoneNumber', this.phoneNumber)

            this.buildSourceForAlertChannelProps(builder)
          })
        })
      }))
    }))
  }
}
