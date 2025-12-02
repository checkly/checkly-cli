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
  name?: string
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
   * {@link https://www.checklyhq.com/docs/constructs/phone-call-alert-channel/ Read more in the docs}
   * {@link https://www.checklyhq.com/docs/integrations/alerts/phone-calls/#supported-countries-and-regions | List of supported countries}
   */
  constructor (logicalId: string, props: PhoneCallAlertChannelProps) {
    super(logicalId, props)
    this.phoneNumber = props.phoneNumber
    this.name = props.name
    Session.registerConstruct(this)
  }

  describe (): string {
    return `PhoneCallAlertChannel:${this.logicalId}`
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
}
