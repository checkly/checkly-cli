import { Construct } from './construct'
import { InvalidPropertyValueDiagnostic } from './construct-diagnostics'
import { Diagnostics } from './diagnostics'
import { Session } from './project'
import { ValidationError } from './validator-error'

export type PrivateLocationIcon = 'alert' | 'arrow-down' | 'arrow-left' | 'arrow-right' | 'arrow-small-down'
  | 'arrow-small-left' | 'arrow-small-right' | 'arrow-small-up' | 'arrow-up' | 'beaker' | 'bell' | 'bold'
  | 'book' | 'bookmark' | 'briefcase' | 'broadcast' | 'browser' | 'bug' | 'calendar' | 'check' | 'checklist'
  | 'chevron-down' | 'chevron-left' | 'chevron-right' | 'chevron-up' | 'circle-slash' | 'circuit-board' | 'clippy'
  | 'clock' | 'cloud-download' | 'cloud-upload' | 'code' | 'comment' | 'comment-discussion' | 'credit-card'
  | 'dash' | 'dashboard' | 'database' | 'desktop-download' | 'device-camera' | 'device-camera-video'
  | 'device-desktop' | 'device-mobile' | 'diff' | 'diff-added' | 'diff-ignored' | 'diff-modified' | 'diff-removed'
  | 'diff-renamed' | 'ellipses' | 'ellipsis' | 'eye' | 'file' | 'file-binary' | 'file-code' | 'file-directory'
  | 'file-media' | 'file-pdf' | 'file-submodule' | 'file-symlink-directory' | 'file-symlink-file' | 'file-text'
  | 'file-zip' | 'flame' | 'fold' | 'gear' | 'gift' | 'gist' | 'gist-secret' | 'git-branch' | 'git-commit'
  | 'git-compare' | 'git-merge' | 'git-pull-request' | 'globe' | 'grabber' | 'graph' | 'heart' | 'history' | 'home'
  | 'horizontal-rule' | 'hubot' | 'inbox' | 'info' | 'issue-closed' | 'issue-opened' | 'issue-reopened' | 'italic'
  | 'jersey' | 'key' | 'keyboard' | 'law' | 'light-bulb' | 'link' | 'link-external' | 'list-ordered' | 'list-unordered'
  | 'location' | 'lock' | 'mail' | 'mail-read' | 'mail-reply' | 'markdown' | 'mark-github' | 'megaphone' | 'mention'
  | 'milestone' | 'mirror' | 'mortar-board' | 'mute' | 'no-newline' | 'octoface' | 'organization' | 'package'
  | 'paintcan' | 'pencil' | 'person' | 'pin' | 'plug' | 'plus' | 'plus-small' | 'primitive-dot' | 'primitive-square'
  | 'pulse' | 'question' | 'quote' | 'radio-tower' | 'reply' | 'repo' | 'repo-clone' | 'repo-force-push' | 'repo-forked'
  | 'repo-pull' | 'repo-push' | 'rocket' | 'rss' | 'ruby' | 'search' | 'server' | 'settings' | 'shield' | 'sign-in'
  | 'sign-out' | 'smiley' | 'squirrel' | 'star' | 'stop' | 'sync' | 'tag' | 'tasklist' | 'telescope' | 'terminal'
  | 'text-size' | 'three-bars' | 'thumbsdown' | 'thumbsup' | 'tools' | 'trashcan' | 'triangle-down' | 'triangle-left'
  | 'triangle-right' | 'triangle-up' | 'unfold' | 'unmute' | 'unverified' | 'verified' | 'versions' | 'watch'
  | 'x' | 'zap'
  // Allow any string value, but keep auto complete for known values.
  | (string & Record<never, never>)

export interface PrivateLocationProps {
  /**
   * The name assigned to the private location.
   */
  name: string
  /**
   * A valid slug name.
   */
  slugName: string
  /**
   * An icon
   */
  icon?: PrivateLocationIcon
  /**
   * Define a proxy for outgoing API check HTTP calls from your private location.
   */
  proxyUrl?: string
}

/**
 * Creates a reference to an existing Private Location.
 *
 * References link existing resources to a project without managing them.
 */
export class PrivateLocationRef extends Construct {
  constructor (logicalId: string, physicalId: string|number) {
    super(PrivateLocation.__checklyType, logicalId, physicalId, false)
    Session.registerConstruct(this)
  }

  describe (): string {
    return `PrivateLocationRef:${this.logicalId}`
  }

  synthesize () {
    return null
  }
}

const RE_SLUG = /^((?!((us(-gov)?|ap|ca|cn|eu|sa|af|me)-(central|(north|south)?(east|west)?)-\d+))[a-zA-Z0-9-]{1,30})$/

/**
 * Creates a Private Location
 *
 * @remarks
 *
 * This class make use of the Private Location endpoints.
 *
 * {@link https://www.checklyhq.com/docs/cli/constructs-reference/#privatelocation Read more in the docs}
 */
export class PrivateLocation extends Construct {
  name: string
  slugName: string
  icon?: string
  proxyUrl?: string

  static readonly __checklyType = 'private-location'

  /**
   * Constructs the Private Location instance
   *
   * @param logicalId unique project-scoped resource name identification
   * @param props private location configuration properties
   */
  constructor (logicalId: string, props: PrivateLocationProps) {
    super(PrivateLocation.__checklyType, logicalId)
    this.name = props.name
    this.slugName = props.slugName
    this.icon = props.icon
    this.proxyUrl = props.proxyUrl

    Session.registerConstruct(this)
  }

  describe (): string {
    return `PrivateLocation:${this.logicalId}`
  }

  async validate (diagnostics: Diagnostics): Promise<void> {
    await super.validate(diagnostics)

    if (!RE_SLUG.test(this.slugName)) {
      diagnostics.add(new InvalidPropertyValueDiagnostic(
        'slugName',
        new Error(`Value must not equal any AWS location.`),
      ))
    }
  }

  static fromId (id: string) {
    return new PrivateLocationRef(`private-location-${id}`, id)
  }

  allowInChecklyConfig () {
    return true
  }

  synthesize (): any|null {
    return {
      name: this.name,
      slugName: this.slugName,
      icon: this.icon,
      proxyUrl: this.proxyUrl,
    }
  }
}
