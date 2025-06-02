import fs from 'node:fs/promises'

import { Check, CheckProps } from './check'
import { Session } from './project'
import { CheckConfigDefaults } from '../services/checkly-config-loader'
import { Content, Entrypoint, isContent, isEntrypoint } from './construct'
import CheckTypes from '../constants'
import { CheckDependency } from './browser-check'
import { PlaywrightConfig } from './playwright-config'
import { Diagnostics } from './diagnostics'
import { InvalidPropertyValueDiagnostic, UnsupportedRuntimeFeatureDiagnostic } from './construct-diagnostics'
import { MultiStepCheckBundle } from './multi-step-check-bundle'

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
  readonly code: Content | Entrypoint
  readonly playwrightConfig?: PlaywrightConfig

  /**
   * Constructs the multi-step instance
   *
   * @param logicalId unique project-scoped resource name identification
   * @param props check configuration properties
   * {@link https://checklyhq.com/docs/cli/constructs-reference/#multistepcheck Read more in the docs}
   */
  constructor (logicalId: string, props: MultiStepCheckProps) {
    if (props.group) {
      MultiStepCheck.applyDefaultMultiStepCheckGroupConfig(props, props.group.getMultiStepCheckDefaults())
    }
    MultiStepCheck.applyDefaultMultiStepCheckConfig(props)

    super(logicalId, props)

    this.code = props.code
    this.playwrightConfig = props.playwrightConfig

    Session.registerConstruct(this)
    this.addSubscriptions()
    this.addPrivateLocationCheckAssignments()
  }

  async validate (diagnostics: Diagnostics): Promise<void> {
    if (!isEntrypoint(this.code) && !isContent(this.code)) {
      diagnostics.add(new InvalidPropertyValueDiagnostic(
        'code',
        new Error(`Either "entrypoint" or "content" is required.`),
      ))
    } else if (isEntrypoint(this.code) && isContent(this.code)) {
      diagnostics.add(new InvalidPropertyValueDiagnostic(
        'code',
        new Error(`Provide exactly one of "entrypoint" or "content", but not both.`),
      ))
    }

    const runtime = Session.getRuntime(this.runtimeId)
    if (runtime) {
      if (!runtime.multiStepSupport) {
        diagnostics.add(new UnsupportedRuntimeFeatureDiagnostic(
          runtime.name,
          new Error(`Multi-Step Checks are not supported.`),
        ))
      }
    }

    if (isEntrypoint(this.code)) {
      const entrypoint = this.resolveContentFilePath(this.code.entrypoint)
      try {
        const stats = await fs.stat(entrypoint)
        if (stats.size === 0) {
          diagnostics.add(new InvalidPropertyValueDiagnostic(
            'code',
            new Error(`The file pointed to by "entrypoint" ("${entrypoint}") must not be empty.`),
          ))
        }
      } catch (err) {
        diagnostics.add(new InvalidPropertyValueDiagnostic(
          'code',
          new Error(`The file pointed to by "entrypoint" ("${entrypoint}") cannot be found.`, { cause: err }),
        ))
      }
    }
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
        path: Session.relativePosixPath(filePath),
        content,
      })
    }
    return {
      script: parsed.entrypoint.content,
      scriptPath: Session.relativePosixPath(parsed.entrypoint.filePath),
      dependencies: deps,
    }
  }

  getSourceFile () {
    return this.__checkFilePath
  }

  async bundle (): Promise<MultiStepCheckBundle> {
    return new MultiStepCheckBundle(this, (() => {
      if (isEntrypoint(this.code)) {
        const bundle = MultiStepCheck.bundle(
          this.resolveContentFilePath(this.code.entrypoint),
          this.runtimeId,
        )
        if (!bundle.script) {
          throw new Error(`The "code" property must not point to an empty file.`)
        }
        return bundle
      }

      const script = this.code.content
      return {
        script,
      }
    })())
  }

  synthesize () {
    return {
      ...super.synthesize(),
      checkType: CheckTypes.MULTI_STEP,
      playwrightConfig: this.playwrightConfig,
    }
  }
}
