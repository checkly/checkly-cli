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
  name?: string
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

  describe (): string {
    return `SmsAlertChannel:${this.logicalId}`
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
}
