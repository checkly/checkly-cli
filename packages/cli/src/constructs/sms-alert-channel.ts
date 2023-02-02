import { AlertChannel, AlertChannelProps } from './alert-channel'
import { Session } from './project'

export interface SmsAlertChannelProps extends AlertChannelProps {
  /**
   * The phone number where to send the alert notifications.
   */
  phoneNumber: string
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
  /**
   * Constructs the SMS Alert Channel instance
   *
   * @param logicalId unique project-scoped resource name identification
   * @param props SMS alert channel configuration properties
   */
  constructor (logicalId: string, props: SmsAlertChannelProps) {
    super(logicalId, props)
    this.phoneNumber = props.phoneNumber
    Session.registerConstruct(this)
  }

  synthesize () {
    return {
      ...super.synthesize(),
      type: 'SMS',
      config: {
        number: this.phoneNumber,
      },
    }
  }
}
