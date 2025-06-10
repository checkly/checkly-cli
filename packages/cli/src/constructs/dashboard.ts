import fs from 'node:fs/promises'

import { Construct, Content, Entrypoint, isContent, isEntrypoint } from './construct'
import { Session } from './project'
import { Diagnostics } from './diagnostics'
import { InvalidPropertyValueDiagnostic } from './construct-diagnostics'
import { DashboardBundle } from './dashboard-bundle'

export interface DashboardProps {
  /**
   * A list of one or more tags that filter what checks will be shown in the dashboard.
   * All checks are included if no tag is specified.
   */
  tags?: Array<string>
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
  /**
   * A URL link to redirect when dashboard logo is clicked on.
   */
  link?: string
  /**
   * A piece of text displayed at the top of your dashboard.
   */
  header?: string
  /**
   * A piece of text displayed below the header or title of your dashboard.
   */
  description?: string
  /**
   *  Determines whether to use the full screen or focus in the center. Default: 'FULL'.
   */
  width?: 'FULL'|'960PX'
  /**
   * How often to refresh the dashboard in seconds. Default: 60.
   */
  refreshRate?: 60|300|600
  /**
   * Determines of pagination is on or off. Default: true.
   */
  paginate?: boolean
  /**
   *  How often to trigger pagination in seconds. Default: 60.
   */
  paginationRate?: 30|60|300
  /**
   * Number of checks displayed per page, between 1 and 20. Default: 15.
   */
  checksPerPage?: number
  /**
   * When to use AND operator for tags lookup. Default: false.
   */
  useTagsAndOperator?: boolean
  /**
   * Show or hide the tags on the dashboard. Default: false.
   */
  hideTags?: boolean
  /**
   * Enable or disable incidents on the dashboard. Default: false.
   * @description only paid accounts can enable this feature.
   */
  enableIncidents?: boolean
  /**
   * Expand or collapse checks on the dashboard. Default: false.
   */
  expandChecks?: boolean
  /**
   * Show or hide header and description on the dashboard. Default: true.
   */
  showHeader?: boolean
  /**
   * Custom CSS to be applied to the dashboard.
   */
  customCSS?: Content|Entrypoint
  /**
   * Determines if the dashboard is public or private. Default: false.
   * @description only paid accounts can enable this feature.
   */
  isPrivate?: boolean
  /**
   * Show or hide the P95 stats on the dashboard. Default: true.
   */
  showP95?: boolean
  /**
   * Show or hide the P99 stats on the dashboard. Default: true.
   */
  showP99?: boolean
}

/**
 * Creates a Dashboard
 *
 * @remarks
 *
 * This class make use of the Dashboard endpoints.
 */
export class Dashboard extends Construct {
  readonly tags?: Array<string>
  readonly customUrl?: string
  readonly customDomain?: string
  readonly logo?: string
  readonly favicon?: string
  readonly link?: string
  readonly header?: string
  readonly description?: string
  readonly width?: 'FULL'|'960PX'
  readonly refreshRate?: 60|300|600
  readonly paginate?: boolean
  readonly paginationRate?: 30|60|300
  readonly checksPerPage?: number
  readonly useTagsAndOperator?: boolean
  readonly hideTags?: boolean
  readonly enableIncidents?: boolean
  readonly expandChecks?: boolean
  readonly showHeader?: boolean
  readonly customCSS?: Content | Entrypoint
  readonly isPrivate?: boolean
  readonly showP95?: boolean
  readonly showP99?: boolean

  static readonly __checklyType = 'dashboard'

  /**
   * Constructs the Dashboard instance
   *
   * @param logicalId unique project-scoped resource name identification
   * @param props dashboard configuration properties
   *
   * {@link https://checklyhq.com/docs/cli/constructs-reference/#dashboard Read more in the docs}
   */
  constructor (logicalId: string, props: DashboardProps) {
    super(Dashboard.__checklyType, logicalId)
    this.tags = props.tags
    this.customUrl = props.customUrl
    this.customDomain = props.customDomain
    this.logo = props.logo
    this.favicon = props.favicon
    this.link = props.link
    this.header = props.header
    this.description = props.description
    this.width = props.width
    this.refreshRate = props.refreshRate
    this.paginate = props.paginate
    this.paginationRate = props.paginationRate
    this.checksPerPage = props.checksPerPage
    this.useTagsAndOperator = props.useTagsAndOperator
    this.hideTags = props.hideTags
    this.enableIncidents = props.enableIncidents
    this.expandChecks = props.expandChecks
    this.showHeader = props.showHeader
    this.isPrivate = props.isPrivate
    this.showP95 = props.showP95
    this.showP99 = props.showP99

    Session.registerConstruct(this)
  }

  async validate (diagnostics: Diagnostics): Promise<void> {
    if (!this.customUrl && !this.customDomain) {
      diagnostics.add(new InvalidPropertyValueDiagnostic(
        'customUrl',
        new Error(`Required unless "customDomain" is set.`),
      ))

      diagnostics.add(new InvalidPropertyValueDiagnostic(
        'customDomain',
        new Error(`Required unless "customUrl" is set.`),
      ))
    }

    if (this.customCSS) {
      if (!isEntrypoint(this.customCSS) && !isContent(this.customCSS)) {
        diagnostics.add(new InvalidPropertyValueDiagnostic(
          'customCSS',
          new Error(`Either "entrypoint" or "content" is required.`),
        ))
      } else if (isEntrypoint(this.customCSS) && isContent(this.customCSS)) {
        diagnostics.add(new InvalidPropertyValueDiagnostic(
          'customCSS',
          new Error(`Provide exactly one of "entrypoint" or "content", but not both.`),
        ))
      } else if (isEntrypoint(this.customCSS)) {
        const entrypoint = this.resolveContentFilePath(this.customCSS.entrypoint)
        try {
          await fs.access(entrypoint, fs.constants.R_OK)
        } catch (err: any) {
          diagnostics.add(new InvalidPropertyValueDiagnostic(
            'customCSS',
            new Error(`Unable to access file "${entrypoint}": ${err.message}`, { cause: err }),
          ))
        }
      }
    }
  }

  async bundle (): Promise<DashboardBundle> {
    const customCSS = await (async () => {
      if (this.customCSS) {
        if (isEntrypoint(this.customCSS)) {
          const entrypoint = this.resolveContentFilePath(this.customCSS.entrypoint)
          const content = await fs.readFile(entrypoint)
          return content.toString('utf8')
        }

        return this.customCSS.content
      }
    })()

    return new DashboardBundle(this, {
      customCSS,
    })
  }

  synthesize (): any|null {
    return {
      tags: this.tags,
      customUrl: this.customUrl,
      customDomain: this.customDomain,
      logo: this.logo,
      favicon: this.favicon,
      link: this.link,
      header: this.header,
      description: this.description,
      width: this.width,
      refreshRate: this.refreshRate,
      paginate: this.paginate,
      paginationRate: this.paginationRate,
      checksPerPage: this.checksPerPage,
      useTagsAndOperator: this.useTagsAndOperator,
      hideTags: this.hideTags,
      enableIncidents: this.enableIncidents,
      expandChecks: this.expandChecks,
      showHeader: this.showHeader,
      isPrivate: this.isPrivate,
      showP95: this.showP95,
      showP99: this.showP99,
    }
  }
}
