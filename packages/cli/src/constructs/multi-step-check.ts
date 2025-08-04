import fs from 'node:fs/promises'

import { CheckProps, RuntimeCheck, RuntimeCheckProps } from './check'
import { Session, SharedFileRef } from './project'
import { Content, Entrypoint, isContent, isEntrypoint } from './construct'
import CheckTypes from '../constants'
import { PlaywrightConfig } from './playwright-config'
import { Diagnostics } from './diagnostics'
import { InvalidPropertyValueDiagnostic, UnsupportedRuntimeFeatureDiagnostic } from './construct-diagnostics'
import { MultiStepCheckBundle } from './multi-step-check-bundle'
import { ConfigDefaultsGetter, makeConfigDefaultsGetter } from './check-config'

export interface MultiStepCheckProps extends RuntimeCheckProps {
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
export class MultiStepCheck extends RuntimeCheck {
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
    super(logicalId, props)

    const config = this.applyConfigDefaults(props)

    this.code = config.code
    this.playwrightConfig = config.playwrightConfig

    Session.registerConstruct(this)
    this.addSubscriptions()
    this.addPrivateLocationCheckAssignments()
  }

  describe (): string {
    return `MultiStepCheck:${this.logicalId}`
  }

  async validate (diagnostics: Diagnostics): Promise<void> {
    await super.validate(diagnostics)

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
    } else if (isEntrypoint(this.code)) {
      const entrypoint = this.resolveContentFilePath(this.code.entrypoint)
      try {
        const stats = await fs.stat(entrypoint)
        if (stats.size === 0) {
          diagnostics.add(new InvalidPropertyValueDiagnostic(
            'code',
            new Error(`The entrypoint file "${entrypoint}" must not be empty.`),
          ))
        }
      } catch (err: any) {
        diagnostics.add(new InvalidPropertyValueDiagnostic(
          'code',
          new Error(`Unable to access entrypoint file "${entrypoint}": ${err.message}`, { cause: err }),
        ))
      }
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
  }

  protected configDefaultsGetter (props: CheckProps): ConfigDefaultsGetter {
    return makeConfigDefaultsGetter(
      props.group?.getMultiStepCheckDefaults(),
      Session.multiStepCheckDefaults,
      props.group?.getCheckDefaults(),
      Session.checkDefaults,
    )
  }

  protected applyConfigDefaults<T extends RuntimeCheckProps & Pick<MultiStepCheckProps, 'playwrightConfig'>> (props: T): T {
    const config = super.applyConfigDefaults(props)
    const defaults = this.configDefaultsGetter(props)

    config.playwrightConfig ??= defaults("playwrightConfig")

    return config
  }

  static async bundle (entry: string, runtimeId?: string) {
    const runtime = Session.getRuntime(runtimeId)
    if (!runtime) {
      throw new Error(`${runtimeId} is not supported`)
    }
    const parser = Session.getParser(runtime)
    const parsed = await parser.parse(entry)
    // Maybe we can get the parsed deps with the content immediately

    const deps: SharedFileRef[] = []
    for (const { filePath, content } of parsed.dependencies) {
      deps.push(Session.registerSharedFile({
        path: Session.relativePosixPath(filePath),
        content,
      }))
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
    return new MultiStepCheckBundle(this, await (async () => {
      if (isEntrypoint(this.code)) {
        const bundle = await MultiStepCheck.bundle(
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
