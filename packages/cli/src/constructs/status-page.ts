import { Construct } from './construct'
import { Session } from './project'
import { StatusPageService } from './status-page-service'
import { Ref } from './ref'

export interface StatusPageCardProps {
  name: string
  services?: Array<StatusPageService>
}

export interface StatusPageProps {
  name: string
  url: string
  cards?: StatusPageCardProps[]
  /**
   * A custom user domain, e.g. "status.example.com". See the docs on updating your DNS and SSL usage.
   */
  customDomain?: string
  /**
   * A URL pointing to an image file.
   */
  logo?: string
  /**
   * A URL pointing to an image file used as dashboard favicon.
   */
  favicon?: string
}

/**
 * Creates a Dashboard
 *
 * @remarks
 *
 * This class make use of the Dashboard endpoints.
 */
export class StatusPage extends Construct {
  name: string
  cards?: StatusPageCardProps[]
  url: string
  customDomain?: string
  logo?: string
  favicon?: string

  static readonly __checklyType = 'status-page'

  /**
   * Constructs the Dashboard instance
   *
   * @param logicalId unique project-scoped resource name identification
   * @param props dashboard configuration properties
   *
   * {@link https://checklyhq.com/docs/cli/constructs-reference/#dashboard Read more in the docs}
   */
  constructor (logicalId: string, props: StatusPageProps) {
    super(StatusPage.__checklyType, logicalId)
    this.name = props.name
    this.url = props.url
    this.cards = props.cards
    this.customDomain = props.customDomain
    this.logo = props.logo
    this.favicon = props.favicon

    Session.registerConstruct(this)
  }

  synthesize (): any|null {
    return {
      name: this.name,
      url: this.url,
      customDomain: this.customDomain,
      logo: this.logo,
      favicon: this.favicon,
      cards: this.cards?.map(card => ({
        name: card.name,
        services: card
          .services
          ?.map((service) => Ref.from(service.logicalId)),
      })),
    }
  }
}
