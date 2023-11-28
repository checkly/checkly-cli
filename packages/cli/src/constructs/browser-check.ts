import * as path from 'path'
import { Check, CheckProps } from './check'
import { Session } from './project'
import { Parser } from '../services/check-parser/parser'
import { CheckConfigDefaults } from '../services/checkly-config-loader'
import { pathToPosix } from '../services/util'
import { Content, Entrypoint } from './construct'
import { detectSnapshots, Snapshot } from '../services/snapshot-service'

export interface CheckDependency {
  path: string
  content: string
}

export interface BrowserCheckProps extends CheckProps {
  /**
   * A valid piece of Node.js javascript code describing a browser interaction
   * with the Puppeteer or Playwright frameworks.
   */
  code: Content|Entrypoint
  /**
   * A valid fully qualified domain name (FQDN) to check for SSL certificate
   * expiration. For example, 'app.checklyhq.com'.
   */
  sslCheckDomain?: string
}

/**
 * Creates a Browser Check
 *
 * @remarks
 *
 * This class make use of the Browser Checks endpoints.
 */
export class BrowserCheck extends Check {
  script: string
  scriptPath?: string
  dependencies?: Array<CheckDependency>
  sslCheckDomain?: string

  // For snapshots, we first store `rawSnapshots` with the path to the file.
  // The `snapshots` field is set later (with a `key`) after these are uploaded to storage.
  rawSnapshots?: Array<{ absolutePath: string, path: string }>
  snapshots?: Array<Snapshot>

  /**
   * Constructs the Browser Check instance
   *
   * @param logicalId unique project-scoped resource name identification
   * @param props check configuration properties
   * {@link https://checklyhq.com/docs/cli/constructs/#browsercheck Read more in the docs}
   */
  constructor (logicalId: string, props: BrowserCheckProps) {
    if (props.group) {
      BrowserCheck.applyDefaultBrowserCheckGroupConfig(props, props.group.getBrowserCheckDefaults())
    }
    BrowserCheck.applyDefaultBrowserCheckConfig(props)
    super(logicalId, props)
    this.sslCheckDomain = props.sslCheckDomain
    if ('content' in props.code) {
      const script = props.code.content
      this.script = script
    } else if ('entrypoint' in props.code) {
      const entrypoint = props.code.entrypoint
      let absoluteEntrypoint = null
      if (path.isAbsolute(entrypoint)) {
        absoluteEntrypoint = entrypoint
      } else {
        if (!Session.checkFileAbsolutePath) {
          throw new Error('You cannot use relative paths without the checkFileAbsolutePath in session')
        }
        absoluteEntrypoint = path.join(path.dirname(Session.checkFileAbsolutePath), entrypoint)
      }
      // runtimeId will always be set by check or browser check defaults so it is safe to use ! operator
      const bundle = BrowserCheck.bundle(absoluteEntrypoint, this.runtimeId!)
      if (!bundle.script) {
        throw new Error(`Browser check "${logicalId}" is not allowed to be empty`)
      }
      this.script = bundle.script
      this.scriptPath = bundle.scriptPath
      this.dependencies = bundle.dependencies
      this.rawSnapshots = bundle.snapshots
    } else {
      throw new Error('Unrecognized type for the "code" property. The "code" property should be a string of JS/TS code.')
    }
    Session.registerConstruct(this)
    this.addSubscriptions()
    this.addPrivateLocationCheckAssignments()
  }

  private static applyDefaultBrowserCheckGroupConfig (props: CheckConfigDefaults, groupProps: CheckConfigDefaults) {
    let configKey: keyof CheckConfigDefaults
    for (configKey in groupProps) {
      const newVal: any = props[configKey] ?? groupProps[configKey]
      props[configKey] = newVal
    }
  }

  private static applyDefaultBrowserCheckConfig (props: CheckConfigDefaults) {
    if (!Session.browserCheckDefaults) {
      return
    }
    let configKey: keyof CheckConfigDefaults
    for (configKey in Session.browserCheckDefaults) {
      const newVal: any = props[configKey] ?? Session.browserCheckDefaults[configKey]
      props[configKey] = newVal
    }
  }

  static bundle (entry: string, runtimeId: string) {
    const runtime = Session.availableRuntimes[runtimeId]
    if (!runtime) {
      throw new Error(`${runtimeId} is not supported`)
    }
    const parser = new Parser(Object.keys(runtime.dependencies))
    const parsed = parser.parse(entry)
    // Maybe we can get the parsed deps with the content immediately

    const deps: CheckDependency[] = []
    for (const { filePath, content } of parsed.dependencies) {
      const relativePath = pathToPosix(path.relative(Session.basePath!, filePath))
      if (relativePath.startsWith('..')) {
        throw new Error(`You cannot reference a dependency file above the Checkly config location folder. Please, modify "${relativePath}" path.`)
      }
      deps.push({
        path: relativePath,
        content,
      })
    }
    return {
      script: parsed.entrypoint.content,
      scriptPath: pathToPosix(path.relative(Session.basePath!, parsed.entrypoint.filePath)),
      dependencies: deps,
      snapshots: detectSnapshots(Session.basePath!, parsed.entrypoint.filePath),
    }
  }

  getSourceFile () {
    return this.__checkFilePath ?? this.scriptPath
  }

  synthesize () {
    return {
      ...super.synthesize(),
      checkType: 'BROWSER',
      script: this.script,
      scriptPath: this.scriptPath,
      dependencies: this.dependencies,
      sslCheckDomain: this.sslCheckDomain || null, // empty string is converted to null
      snapshots: this.snapshots,
    }
  }
}
