/**
 * An integration an alert channel delivers its alerts through, identified by
 * the type the account's `integrations` list reports it as.
 *
 * @internal Used by the built-in alert channel constructs to check the
 * account's plan. Not part of the public constructs API.
 */
export interface AlertChannelIntegration {
  /**
   * The integration type, e.g. `PAGERDUTY`.
   */
  type: string
  /**
   * The integration's human-readable name, e.g. `PagerDuty`.
   */
  name: string
}

// The integrations the alert channel constructs deliver through. Each `type`
// must match the one the Checkly API reports in the account's `integrations`
// list; a type the API does not report is never checked.

/** @internal */
export const SLACK_INTEGRATION: AlertChannelIntegration = { type: 'SLACK', name: 'Slack' }
/** @internal */
export const PAGERDUTY_INTEGRATION: AlertChannelIntegration = { type: 'PAGERDUTY', name: 'PagerDuty' }
/** @internal */
export const OPSGENIE_INTEGRATION: AlertChannelIntegration = { type: 'OPSGENIE', name: 'Opsgenie' }
/** @internal */
export const SMS_INTEGRATION: AlertChannelIntegration = { type: 'SMS', name: 'SMS' }
/** @internal */
export const PHONE_CALL_INTEGRATION: AlertChannelIntegration = { type: 'PHONE_CALL', name: 'phone calls' }
/** @internal */
export const MSTEAMS_INTEGRATION: AlertChannelIntegration = { type: 'MSTEAMS', name: 'Microsoft Teams' }
/** @internal */
export const DISCORD_INTEGRATION: AlertChannelIntegration = { type: 'DISCORD', name: 'Discord' }
/** @internal */
export const TELEGRAM_INTEGRATION: AlertChannelIntegration = { type: 'TELEGRAM', name: 'Telegram' }
/** @internal */
export const FIREHYDRANT_INTEGRATION: AlertChannelIntegration = { type: 'FIREHYDRANT', name: 'FireHydrant' }
/** @internal */
export const GITLAB_INTEGRATION: AlertChannelIntegration = { type: 'GITLAB', name: 'GitLab' }
/** @internal */
export const SPIKE_INTEGRATION: AlertChannelIntegration = { type: 'SPIKE', name: 'Spike.sh' }
/** @internal */
export const SPLUNK_INTEGRATION: AlertChannelIntegration = { type: 'SPLUNK', name: 'Splunk' }
/** @internal */
export const CORALOGIX_INTEGRATION: AlertChannelIntegration = { type: 'CORALOGIX', name: 'Coralogix' }
/** @internal */
export const ILERT_INTEGRATION: AlertChannelIntegration = { type: 'ILERT', name: 'ilert' }
/** @internal */
export const INCIDENTIO_INTEGRATION: AlertChannelIntegration = { type: 'INCIDENTIO', name: 'incident.io' }
/** @internal */
export const ROOTLY_INTEGRATION: AlertChannelIntegration = { type: 'ROOTLY', name: 'Rootly' }
