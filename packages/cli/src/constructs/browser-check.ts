import * as path from 'path'
import { Check, CheckProps } from './check'
import { Session } from './project'
import { CheckConfigDefaults } from '../services/checkly-config-loader'
import { pathToPosix } from '../services/util'
import { Content, Entrypoint } from './construct'
import { detectSnapshots, Snapshot } from '../services/snapshot-service'
import { PlaywrightConfig, sourceForPlaywrightConfig } from './playwright-config'
import { expr, ident, Program } from '../sourcegen'

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
  /**
   * A valid playwright config object, same format and keys as you would use on
   * playwright.config.ts
   */
  playwrightConfig?: PlaywrightConfig,
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
  playwrightConfig?: PlaywrightConfig

  /**
   * Constructs the Browser Check instance
   *
   * @param logicalId unique project-scoped resource name identification
   * @param props check configuration properties
   * {@link https://checklyhq.com/docs/cli/constructs-reference/#browsercheck Read more in the docs}
   */
  constructor (logicalId: string, props: BrowserCheckProps) {
    if (props.group) {
      BrowserCheck.applyDefaultBrowserCheckGroupConfig(props, props.group.getBrowserCheckDefaults())
    }
    BrowserCheck.applyDefaultBrowserCheckConfig(props)
    super(logicalId, props)
    this.sslCheckDomain = props.sslCheckDomain
    this.playwrightConfig = props.playwrightConfig
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
      const bundle = BrowserCheck.bundle(absoluteEntrypoint, this.runtimeId)
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

  static bundle (entry: string, runtimeId?: string) {
    const runtime = Session.getRuntime(runtimeId)
    if (!runtime) {
      throw new Error(`${runtimeId} is not supported`)
    }
    const parser = Session.getParser(runtime)
    const parsed = parser.parse(entry)
    // Maybe we can get the parsed deps with the content immediately

    const deps: CheckDependency[] = []
    for (const { filePath, content } of parsed.dependencies) {
      deps.push({
        path: pathToPosix(path.relative(Session.basePath!, filePath)),
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
      playwrightConfig: this.playwrightConfig,
    }
  }

  source (program: Program): void {
    program.import('BrowserCheck', 'checkly/constructs')

    program.section(expr(ident('BrowserCheck'), builder => {
      builder.new(builder => {
        builder.string(this.logicalId)
        builder.object(builder => {
          builder.object('code', builder => {
            if (this.scriptPath) {
              // TODO separate file
              builder.string('entrypoint', this.scriptPath)
              builder.string('content', this.script)
            } else {
              builder.string('content', this.script)
            }
          })

          if (this.sslCheckDomain) {
            builder.string('sslCheckDomain', this.sslCheckDomain)
          }

          if (this.playwrightConfig) {
            builder.value('playwrightConfig', sourceForPlaywrightConfig(this.playwrightConfig))
          }

          this.buildSourceForCheckProps(program, builder)
        })
      })
    }))
  }
}
