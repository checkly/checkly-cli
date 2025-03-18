import { decl, expr, ident, Program } from '../sourcegen'
import { AlertChannel, AlertChannelProps } from './alert-channel'
import { Session } from './project'

export interface PhoneCallAlertChannelProps extends AlertChannelProps {
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
 * Creates a Phone Call Alert Channel
 *
 * @remarks
 *
 * This class make use of the Alert Channel endpoints.
 */
export class PhoneCallAlertChannel extends AlertChannel {
  phoneNumber: string
  name?: string
  /**
   * Constructs the Phone Call Alert Channel instance
   *
   * @param logicalId unique project-scoped resource name identification
   * @param props Phone Call alert channel configuration properties
   *
   * {@link https://checklyhq.com/docs/cli/constructs-reference/#phonecallalertchannel Read more in the docs}
   * {@link https://checklyhq.com/docs/alerting/phone-calls/#supported-countries-and-regions
   *  List of supported countries}
   */
  constructor (logicalId: string, props: PhoneCallAlertChannelProps) {
    super(logicalId, props)
    this.phoneNumber = props.phoneNumber
    this.name = props.name
    Session.registerConstruct(this)
  }

  synthesize () {
    return {
      ...super.synthesize(),
      type: 'CALL',
      config: {
        number: this.phoneNumber,
        name: this.name,
      },
    }
  }

  source (program: Program): void {
    program.import('PhoneCallAlertChannel', 'checkly/constructs')

    const id = program.registerVariable(
      `PhoneCallAlertChannel::${this.logicalId}`,
      ident(program.nth('phoneCallAlertChannel')),
    )

    program.section(decl(id, builder => {
      builder.variable(expr(ident('PhoneCallAlertChannel'), builder => {
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
