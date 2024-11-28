import * as path from 'path'
import { Check, CheckProps } from './check'
import { Session } from './project'
import { Parser } from '../services/check-parser/parser'
import { CheckConfigDefaults } from '../services/checkly-config-loader'
import { pathToPosix } from '../services/util'
import { Content, Entrypoint } from './construct'
import CheckTypes from '../constants'
import { CheckDependency } from './browser-check'
import { PlaywrightConfig } from './playwright-config'

export interface MultiStepCheckProps extends CheckProps {
  /**
   * A valid piece of Node.js javascript code describing a multi-step interaction
   * with the Puppeteer or Playwright frameworks.
   */
  code: Content|Entrypoint,
  playwrightConfig?: PlaywrightConfig
}

/**
 * Creates a multi-step Check
 *
 * @remarks
 *
 * This class make use of the multi-step checks endpoints.
 */
export class MultiStepCheck extends Check {
  script: string
  scriptPath?: string
  dependencies?: Array<CheckDependency>
  playwrightConfig?: PlaywrightConfig

  /**
   * Constructs the multi-step instance
   *
   * @param logicalId unique project-scoped resource name identification
   * @param props check configuration properties
   * {@link https://checklyhq.com/docs/cli/constructs/#multistepcheck Read more in the docs}
   */
  constructor (logicalId: string, props: MultiStepCheckProps) {
    if (props.group) {
      MultiStepCheck.applyDefaultMultiStepCheckGroupConfig(props, props.group.getMultiStepCheckDefaults())
    }
    MultiStepCheck.applyDefaultMultiStepCheckConfig(props)
    super(logicalId, props)

    this.playwrightConfig = props.playwrightConfig

    if (!Session.availableRuntimes[this.runtimeId!]?.multiStepSupport) {
      throw new Error('This runtime does not support multi step checks.')
    }
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
      // runtimeId will always be set by check or multi-step check defaults so it is safe to use ! operator
      const bundle = MultiStepCheck.bundle(absoluteEntrypoint, this.runtimeId!)
      if (!bundle.script) {
        throw new Error(`Multi-Step check "${logicalId}" is not allowed to be empty`)
      }
      this.script = bundle.script
      this.scriptPath = bundle.scriptPath
      this.dependencies = bundle.dependencies
    } else {
      throw new Error('Unrecognized type for the "code" property. The "code" property should be a string of JS/TS code.')
    }
    Session.registerConstruct(this)
    this.addSubscriptions()
    this.addPrivateLocationCheckAssignments()
  }

  private static applyDefaultMultiStepCheckGroupConfig (props: CheckConfigDefaults, groupProps: CheckConfigDefaults) {
    let configKey: keyof CheckConfigDefaults
    for (configKey in groupProps) {
      const newVal: any = props[configKey] ?? groupProps[configKey]
      props[configKey] = newVal
    }
  }

  private static applyDefaultMultiStepCheckConfig (props: CheckConfigDefaults) {
    if (!Session.multiStepCheckDefaults) {
      return
    }
    let configKey: keyof CheckConfigDefaults
    for (configKey in Session.multiStepCheckDefaults) {
      const newVal: any = props[configKey] ?? Session.multiStepCheckDefaults[configKey]
      props[configKey] = newVal
    }
  }

  static bundle (entry: string, runtimeId: string) {
    const runtime = Session.availableRuntimes[runtimeId]
    if (!runtime) {
      throw new Error(`${runtimeId} is not supported`)
    }
    const parser = new Parser({
      supportedNpmModules: Object.keys(runtime.dependencies),
      checkUnsupportedModules: Session.verifyRuntimeDependencies,
    })
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
    }
  }

  getSourceFile () {
    return this.__checkFilePath ?? this.scriptPath
  }

  synthesize () {
    return {
      ...super.synthesize(),
      checkType: CheckTypes.MULTI_STEP,
      script: this.script,
      scriptPath: this.scriptPath,
      dependencies: this.dependencies,
      playwrightConfig: this.playwrightConfig,
    }
  }
}
