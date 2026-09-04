import { Construct } from './construct.js'
import { Diagnostics } from './diagnostics.js'
import { validatePhysicalIdIsUuid } from './internal/common-diagnostics.js'
import { Session } from './session.js'
import type { StatusPageTheme } from './status-page.js'

export interface StatusPageV3Props {
  /**
   * The name of the status page.
   */
  name: string
  /**
   * The URL of the status page.
   */
  url: string
  /**
   * A custom user domain, e.g. "status.example.com". See the docs on updating your DNS and SSL usage.
   */
  customDomain?: string
  /**
   * A short description shown on the status page.
   */
  description?: string
  /**
   * A URL pointing to an image file that serves as the logo for the status page.
   */
  logo?: string
  /**
   * A URL pointing to an image file that serves as the logo in dark mode.
   */
  logoDark?: string
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
  /**
   * A link to your privacy policy, shown in the page footer.
   */
  privacyPolicyLink?: string
  /**
   * A link to your terms of service, shown in the page footer.
   */
  termsOfServiceLink?: string
  /**
   * Free-form footer text.
   */
  footerText?: string
  /**
   * A Google Analytics tag ID (e.g. "G-XXXXXXXXXX") to embed on the public page.
   */
  googleAnalyticsTag?: string
  /**
   * Whether search engines may index the public page. Defaults to true.
   */
  allowIndexing?: boolean
  /**
   * Protect the status page with a generated password. The password is shown
   * once after the deployment that enables protection.
   */
  isPrivate?: boolean
}

/**
 * Creates a reference to an existing v3 Status Page.
 *
 * References link existing resources to a project without managing them —
 * typically so components and automation rules declared in code can attach
 * to a page that was created in the UI.
 *
 * Use {@link StatusPageV3.fromId()} instead of instantiating this class directly.
 */
export class StatusPageV3Ref extends Construct {
  constructor (logicalId: string, physicalId: string) {
    super(StatusPageV3.__checklyType, logicalId, physicalId, false)
    Session.registerConstruct(this)
  }

  describe (): string {
    return `StatusPageV3Ref:${this.logicalId}`
  }

  async validate (diagnostics: Diagnostics): Promise<void> {
    await super.validate(diagnostics)
    await validatePhysicalIdIsUuid(diagnostics, 'StatusPageV3', this.physicalId)
  }

  synthesize () {
    return null
  }
}

/**
 * Creates a v3 (components-based) Status Page.
 *
 * Unlike {@link StatusPage}, a v3 page has no cards or services. Its structure
 * is declared with {@link StatusPageV3Component} constructs that point at the
 * page, and incidents can be automated with {@link StatusPageV3AutomationRule}.
 *
 * A page's generation cannot change in place: a logical id that was deployed
 * as a `StatusPage` cannot be redeployed as a `StatusPageV3` (or vice versa).
 */
export class StatusPageV3 extends Construct {
  name: string
  url: string
  customDomain?: string
  description?: string
  logo?: string
  logoDark?: string
  redirectTo?: string
  favicon?: string
  defaultTheme?: StatusPageTheme
  privacyPolicyLink?: string
  termsOfServiceLink?: string
  footerText?: string
  googleAnalyticsTag?: string
  allowIndexing?: boolean
  isPrivate?: boolean

  // Same resource type as the v2 page: both live in one table and are told
  // apart by the `version` discriminator synthesized below.
  static readonly __checklyType = 'status-page'

  /**
   * Constructs the v3 Status Page instance
   *
   * @param logicalId unique project-scoped resource name identification
   * @param props status page configuration properties
   *
   * {@link https://www.checklyhq.com/docs/constructs/status-page-v3/ Read more in the docs}
   */
  constructor (logicalId: string, props: StatusPageV3Props) {
    super(StatusPageV3.__checklyType, logicalId)
    this.name = props.name
    this.url = props.url
    this.customDomain = props.customDomain
    this.description = props.description
    this.logo = props.logo
    this.logoDark = props.logoDark
    this.redirectTo = props.redirectTo
    this.favicon = props.favicon
    this.defaultTheme = props.defaultTheme
    this.privacyPolicyLink = props.privacyPolicyLink
    this.termsOfServiceLink = props.termsOfServiceLink
    this.footerText = props.footerText
    this.googleAnalyticsTag = props.googleAnalyticsTag
    this.allowIndexing = props.allowIndexing
    this.isPrivate = props.isPrivate

    Session.registerConstruct(this)
  }

  describe (): string {
    return `StatusPageV3:${this.logicalId}`
  }

  /**
   * @param id - The UUID of the existing v3 status page
   */
  static fromId (id: string) {
    return new StatusPageV3Ref(`status-page-${id}`, id)
  }

  synthesize (): any | null {
    return {
      name: this.name,
      url: this.url,
      customDomain: this.customDomain,
      description: this.description,
      logo: this.logo,
      logoDark: this.logoDark,
      redirectTo: this.redirectTo,
      favicon: this.favicon,
      defaultTheme: this.defaultTheme,
      privacyPolicyLink: this.privacyPolicyLink,
      termsOfServiceLink: this.termsOfServiceLink,
      footerText: this.footerText,
      googleAnalyticsTag: this.googleAnalyticsTag,
      allowIndexing: this.allowIndexing,
      isPrivate: this.isPrivate,
      version: 3,
    }
  }
}
