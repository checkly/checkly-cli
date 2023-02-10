import { AlertChannel, AlertChannelProps } from './alert-channel'
import { Session } from '../internals'

export interface PagerdutyAlertChannelProps extends AlertChannelProps {
  /**
   * The name of your Pagerduty account.
   */
  account?: string
  /**
   * The name of your service defined in Pagerduty under which the alerts should be nested.
   */
  serviceName?: string
  /**
   * The API key created by installing the Checkly integration in Pagerduty. You
   * can {@link https://app.checklyhq.com/alerts/settings/channels/new/pagerduty install the Pagerduty alert channel}
   * first from our UI to grab the `serviceKey`
   */
  serviceKey: string
}

/**
 * Creates an Pagerduty Alert Channel
 *
 * @remarks
 *
 * This class make use of the Alert Channel endpoints.
 */
export class PagerdutyAlertChannel extends AlertChannel {
  account?: string
  serviceName?: string
  serviceKey: string
  /**
   * Constructs the Pagerduty Alert Channel instance
   *
   * @param logicalId unique project-scoped resource name identification
   * @param props Pagerduty alert channel configuration properties
   */
  constructor (logicalId: string, props: PagerdutyAlertChannelProps) {
    super(logicalId, props)
    this.account = props.account
    this.serviceName = props.serviceName
    this.serviceKey = props.serviceKey
    Session.registerConstruct(this)
  }

  synthesize () {
    return {
      ...super.synthesize(),
      type: 'PAGERDUTY',
      config: {
        account: this.account,
        serviceName: this.serviceName,
        serviceKey: this.serviceKey,
      },
    }
  }
}
