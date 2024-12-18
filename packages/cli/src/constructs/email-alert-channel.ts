import { AlertChannel, AlertChannelProps } from './alert-channel'
import { Session } from './project'

export interface EmailAlertChannelProps extends AlertChannelProps {
  /**
   * The email address where to send the alert notifications.
   */
  address: string
}

/**
 * Creates an Email Alert Channel
 *
 * @remarks
 *
 * This class make use of the Alert Channel endpoints.
 */
export class EmailAlertChannel extends AlertChannel {
  address: string
  /**
   * Constructs the Email Alert Channel instance
   *
   * @param logicalId unique project-scoped resource name identification
   * @param props email alert channel configuration properties
   * {@link https://checklyhq.com/docs/cli/constructs-reference/#emailalertchannel Read more in the docs}
   */
  constructor (logicalId: string, props: EmailAlertChannelProps) {
    super(logicalId, props)
    this.address = props.address
    Session.registerConstruct(this)
  }

  synthesize () {
    return {
      ...super.synthesize(),
      type: 'EMAIL',
      config: {
        address: this.address,
      },
    }
  }
}
