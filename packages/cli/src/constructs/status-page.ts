import { Construct } from './construct'
import { Session } from './project'
import { StatusPageService } from './status-page-service'
import { Ref } from './ref'

export interface StatusPageCardProps {
  /**
   * The name of the card.
   */
  name: string
  /**
   * A list of services to include in the card.
   */
  services?: Array<StatusPageService>
}

export interface StatusPageProps {
  /**
   * The name of the status page.
   */
  name: string
  /**
   * The URL of the status page.
   */
  url: string
  /**
   * A list of cards to add to your status page.
   */
  cards?: StatusPageCardProps[]
  /**
   * A custom user domain, e.g. "status.example.com". See the docs on updating your DNS and SSL usage.
   */
  customDomain?: string
  /**
   * A URL pointing to an image file that serves as the logo for the status page.
   */
  logo?: string
  /**
   * A URL pointing to an image file to be used as the favicon for the status page.
   */
  favicon?: string
}

/**
 * Creates a Status Page
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
   * Constructs the Status Page instance
   *
   * @param logicalId unique project-scoped resource name identification
   * @param props status page configuration properties
   *
   * {@link https://checklyhq.com/docs/cli/constructs-reference/#statuspage Read more in the docs}
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
