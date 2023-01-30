import { AlertChannel, AlertChannelProps } from './alert-channel'

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
 * This class make use of the Alert Channel endpoints
 * listed {@link https://developers.checklyhq.com/reference/postv1alertchannels here}
 */
export class EmailAlertChannel extends AlertChannel {
  address: string
  /**
   * Constructs the Email Alert Channel instance
   *
   * @param logicalId unique project-scoped resource name identification
   * @param props email alert channel configuration properties
   */
  constructor (logicalId: string, props: EmailAlertChannelProps) {
    super(logicalId, props)
    this.address = props.address
    this.register(AlertChannel.__checklyType, logicalId, this.synthesize())
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
