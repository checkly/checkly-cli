import { decl, expr, ident, Program } from '../sourcegen'
import { AlertChannel, AlertChannelProps } from './alert-channel'
import { Session } from './project'

export type OpsgeniePriority = 'P1' | 'P2' | 'P3' | 'P4' | 'P5'

export type OpsgenieRegion = 'EU' | 'US'

export interface OpsgenieAlertChannelProps extends AlertChannelProps {
  /**
   * Friendly name to recognise the integration.
   */
  name: string
  /**
   * An API key for your Opsgenie account. See our
   * {@link https://www.checklyhq.com/docs/integrations/opsgenie/ docs} on where to create this API key
   */
  apiKey: string
  /**
   * Configure the Opsgenie location, either `EU` or `US`.
   */
  region: OpsgenieRegion
  /**
   * Configure the severity level, `P1` to `P5`.
   */
  priority: OpsgeniePriority
}

/**
 * Creates an Opsgenie Alert Channel
 *
 * @remarks
 *
 * This class make use of the Alert Channel endpoints.
 */
export class OpsgenieAlertChannel extends AlertChannel {
  name: string
  apiKey: string
  region: OpsgenieRegion
  priority: OpsgeniePriority
  /**
   * Constructs the Opsgenie Alert Channel instance
   *
   * @param logicalId unique project-scoped resource name identification
   * @param props Opsgenie alert channel configuration properties
   *
   * {@link https://checklyhq.com/docs/cli/constructs-reference/#opsgeniealertchannel Read more in the docs}
   */
  constructor (logicalId: string, props: OpsgenieAlertChannelProps) {
    super(logicalId, props)
    this.name = props.name
    this.apiKey = props.apiKey
    this.region = props.region
    this.priority = props.priority
    Session.registerConstruct(this)
  }

  synthesize () {
    return {
      ...super.synthesize(),
      type: 'OPSGENIE',
      config: {
        name: this.name,
        apiKey: this.apiKey,
        region: this.region,
        priority: this.priority,
      },
    }
  }

  source (program: Program): void {
    program.import('OpsgenieAlertChannel', 'checkly/constructs')

    const id = program.registerVariable(
      `OpsgenieAlertChannel::${this.logicalId}`,
      ident(program.nth('opsgenieAlertChannel')),
    )

    program.section(decl(id, builder => {
      builder.variable(expr(ident('OpsgenieAlertChannel'), builder => {
        builder.new(builder => {
          builder.string(this.logicalId)
          builder.object(builder => {
            builder.string('name', this.name)
            builder.string('apiKey', this.apiKey)
            builder.string('region', this.region)
            builder.string('priority', this.priority)

            this.buildSourceForAlertChannelProps(builder)
          })
        })
      }))
    }))
  }
}
