import { Construct } from './construct'
import { Session } from './project'
import { StatusPagesService } from './status-pages-service'
import { Ref } from './ref'

export interface StatusPagesCardProps {
  name: string
  services?: Array<StatusPagesService>
}

export interface StatusPageProps {
  name: string
  url?: string
  cards?: StatusPagesCardProps[]
  /**
   * A subdomain name under "checklyhq.com". Needs to be unique across all users.
   * This is required if 'customDomain' is not specified.
   */
  customUrl?: string
  /**
   * A custom user domain, e.g. "status.example.com". See the docs on updating your DNS and SSL usage.
   * This is required if 'customUrl' is not specified.
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
  cardsServices?: null | Array<{name: string, services: Array<{ref: Ref}>}>
  cards?: StatusPagesCardProps[]
  url?: string
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
    this.cardsServices = null

    if (!props.url && !props.customDomain) {
      throw new Error('Either a "customUrl" or "customDomain" must be specified.')
    }

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
