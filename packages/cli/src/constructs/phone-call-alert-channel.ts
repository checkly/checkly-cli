import { AlertChannel, AlertChannelProps } from './alert-channel'
import { Session } from './project'

export interface PhoneCallAlertChannelProps extends AlertChannelProps {
  /**
   * The phone number where to send the alert notifications.
   */
  phoneNumber: string
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
  /**
   * Constructs the Phone Call Alert Channel instance
   *
   * @param logicalId unique project-scoped resource name identification
   * @param props Phone Call alert channel configuration properties
   *
   * {@link https://checklyhq.com/docs/cli/constructs-reference/#phonecallalertchannel Read more in the docs}
   */
  constructor (logicalId: string, props: PhoneCallAlertChannelProps) {
    super(logicalId, props)
    this.phoneNumber = props.phoneNumber
    Session.registerConstruct(this)
  }

  synthesize () {
    return {
      ...super.synthesize(),
      type: 'CALL',
      config: {
        number: this.phoneNumber,
      },
    }
  }
}
