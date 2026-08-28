import { Construct } from './construct.js'
import { Session } from './session.js'
import { StatusPageService } from './status-page-service.js'
import { Ref } from './ref.js'
import { Diagnostics } from './diagnostics.js'
import { DeprecatedConstructDiagnostic } from './construct-diagnostics.js'

export interface StatusPageCardProps {
  /**
   * The name of the card.
   */
  name: string
  /**
   * A list of services to include in the card.
   */
  services?: StatusPageService[]
}

export type StatusPageTheme = 'AUTO' | 'DARK' | 'LIGHT'

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
  cards: StatusPageCardProps[]
  /**
   * A custom user domain, e.g. "status.example.com". See the docs on updating your DNS and SSL usage.
   */
  customDomain?: string
  /**
   * A URL pointing to an image file that serves as the logo for the status page.
   */
  logo?: string
  /**
   * The URL that clicking the logo should redirect the user to.
   */
  redirectTo?: string
  /**
   * A URL pointing to an image file to be used as the favicon for the status page.
   */
  favicon?: string
  /**
   * The default theme of the status page.
   */
  defaultTheme?: StatusPageTheme
}

/**
 * Creates a Status Page.
 *
 * We strongly recommend upgrading to {@link StatusPageV3}.
 *
 * The original Status Page works with cards and services and per-check
 * incident automations. The new, v3 Status Page works with components, a simpler
 * impact based system and automations directly controllable from a status page.
 *
 * @deprecated Use {@link StatusPageV3} instead.
 */
export class StatusPage extends Construct {
  name: string
  cards: StatusPageCardProps[]
  url: string
  customDomain?: string
  logo?: string
  redirectTo?: string
  favicon?: string
  defaultTheme?: StatusPageTheme

  static readonly __checklyType = 'status-page'

  /**
   * Constructs the Status Page instance
   *
   * @param logicalId unique project-scoped resource name identification
   * @param props status page configuration properties
   *
   * {@link https://www.checklyhq.com/docs/constructs/status-page/ Read more in the docs}
   */
  constructor (logicalId: string, props: StatusPageProps) {
    super(StatusPage.__checklyType, logicalId)
    this.name = props.name
    this.url = props.url
    this.cards = props.cards
    this.customDomain = props.customDomain
    this.logo = props.logo
    this.redirectTo = props.redirectTo
    this.favicon = props.favicon
    this.defaultTheme = props.defaultTheme

    Session.registerConstruct(this)
  }

  describe (): string {
    return `StatusPage:${this.logicalId}`
  }

  // eslint-disable-next-line require-await
  protected async onBeforeValidate (diagnostics: Diagnostics): Promise<void> {
    diagnostics.add(new DeprecatedConstructDiagnostic(
      'StatusPage',
      new Error('Please update to StatusPageV3 which is simpler to use and has more, advanced features.'),
    ))
  }

  async validate (diagnostics: Diagnostics): Promise<void> {
    await super.validate(diagnostics)
    await this.onBeforeValidate(diagnostics)
  }

  synthesize (): any | null {
    return {
      name: this.name,
      url: this.url,
      customDomain: this.customDomain,
      logo: this.logo,
      redirectTo: this.redirectTo,
      favicon: this.favicon,
      defaultTheme: this.defaultTheme,
      cards: this.cards.map(card => ({
        name: card.name,
        services: card
          .services
          ?.map(service => Ref.from(service.logicalId)),
      })),
    }
  }
}
