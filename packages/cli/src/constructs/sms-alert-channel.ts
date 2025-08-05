import { AlertChannel, AlertChannelProps } from './alert-channel'
import { Session } from './project'
import { Diagnostics } from './diagnostics'
import { InvalidPropertyValueDiagnostic } from './construct-diagnostics'

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

  describe (): string {
    return `SmsAlertChannel:${this.logicalId}`
  }

  async validate (diagnostics: Diagnostics): Promise<void> {
    await super.validate(diagnostics)

    // Validate phone number format (E.164 format)
    if (this.phoneNumber) {
      const phoneRegex = /^\+[1-9]\d{1,14}$/
      if (!phoneRegex.test(this.phoneNumber)) {
        diagnostics.add(new InvalidPropertyValueDiagnostic(
          'phoneNumber',
          new Error(`Invalid phone number format: "${this.phoneNumber}". Must be in E.164 format (e.g., +1234567890).`),
        ))
      }
    }
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
