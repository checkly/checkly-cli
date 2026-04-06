import { Check, CheckProps } from './check'
import { Frequency } from './frequency'
import { Session } from './project'
import { CheckTypes } from '../constants'
import { Diagnostics } from './diagnostics'
import { InvalidPropertyValueDiagnostic } from './construct-diagnostics'

/**
 * Frequency values (in minutes) currently supported for agentic checks.
 * Mirrors the values exposed in the Checkly webapp's agentic check builder.
 */
const ALLOWED_AGENTIC_FREQUENCIES = [30, 60, 120, 180, 360, 720, 1440] as const

/**
 * Frequencies (in minutes) currently supported for agentic checks: 30, 60, 120,
 * 180, 360, 720 or 1440. The matching `Frequency` constants
 * (`EVERY_30M`, `EVERY_1H`, `EVERY_2H`, `EVERY_3H`, `EVERY_6H`, `EVERY_12H`,
 * `EVERY_24H`) are also accepted.
 */
export type AgenticCheckFrequency =
  | 30
  | 60
  | 120
  | 180
  | 360
  | 720
  | 1440
  | Frequency

/**
 * The single location agentic checks currently run from. Until the platform
 * supports running agentic checks from multiple locations, this value is
 * forced server-side and the construct does not let users override it.
 */
const AGENTIC_CHECK_LOCATION = 'us-east-1'

/**
 * Configuration properties for {@link AgenticCheck}.
 *
 * Agentic checks intentionally expose only the subset of options that the
 * Checkly platform currently supports for them. Properties such as
 * `locations`, `privateLocations`, `runParallel`, `retryStrategy`,
 * `shouldFail`, `doubleCheck`, `triggerIncident` and `groupId` are omitted
 * because the platform does not yet honor them for agentic checks. They will
 * be added back as additive, non-breaking changes once support lands.
 */
export interface AgenticCheckProps extends Omit<CheckProps,
  | 'locations'
  | 'privateLocations'
  | 'runParallel'
  | 'retryStrategy'
  | 'shouldFail'
  | 'doubleCheck'
  | 'triggerIncident'
  | 'groupId'
  | 'frequency'
> {
  /**
   * The prompt that defines what the agentic check should verify.
   * Maximum 10,000 characters.
   */
  prompt: string

  /**
   * How often the check should run. Agentic checks currently support a
   * restricted set of frequencies. Defaults to {@link Frequency.EVERY_30M}.
   *
   * @example
   * ```typescript
   * frequency: Frequency.EVERY_1H
   * // or equivalently
   * frequency: 60
   * ```
   */
  frequency?: AgenticCheckFrequency
}

/**
 * Creates an Agentic Check that uses AI to monitor websites and applications.
 *
 * Agentic checks use a prompt to define what should be verified, without
 * requiring traditional scripts. The AI agent interprets the prompt and
 * performs the checks.
 *
 * @example
 * ```typescript
 * new AgenticCheck('homepage-health', {
 *   name: 'Homepage Health Check',
 *   prompt: `
 *     Navigate to https://example.com and verify:
 *     1. The page loads with a 200 status
 *     2. The main heading is visible
 *     3. No console errors are present
 *   `,
 * })
 * ```
 */
export class AgenticCheck extends Check {
  readonly prompt: string

  /**
   * Constructs the Agentic Check instance.
   *
   * @param logicalId unique project-scoped resource name identification
   * @param props check configuration properties
   */
  constructor (logicalId: string, props: AgenticCheckProps) {
    super(logicalId, props)
    this.prompt = props.prompt

    // Defensive overrides: even though these props are omitted from the type,
    // `Check.applyConfigDefaults()` may pull them in from the project-level
    // `checks` config defaults. Force them to the only values the platform
    // currently honors so the construct never claims to support something
    // it doesn't.
    this.locations = [AGENTIC_CHECK_LOCATION]
    this.privateLocations = undefined
    this.runParallel = false
    this.retryStrategy = undefined
    this.shouldFail = undefined
    this.doubleCheck = undefined
    this.triggerIncident = undefined

    // Default frequency to 30m if the user did not specify one.
    if (this.frequency === undefined) {
      this.frequency = 30
    }

    Session.registerConstruct(this)
    this.addSubscriptions()
  }

  describe (): string {
    return `AgenticCheck:${this.logicalId}`
  }

  async validate (diagnostics: Diagnostics): Promise<void> {
    await super.validate(diagnostics)

    if (!this.prompt || this.prompt.trim().length === 0) {
      diagnostics.add(new InvalidPropertyValueDiagnostic(
        'prompt',
        new Error('"prompt" is required and must not be empty.'),
      ))
    } else if (this.prompt.length > 10_000) {
      diagnostics.add(new InvalidPropertyValueDiagnostic(
        'prompt',
        new Error(`"prompt" must be at most 10000 characters, got ${this.prompt.length}.`),
      ))
    }

    if (this.frequency !== undefined
      && !(ALLOWED_AGENTIC_FREQUENCIES as readonly number[]).includes(this.frequency)) {
      diagnostics.add(new InvalidPropertyValueDiagnostic(
        'frequency',
        new Error(
          `"frequency" must be one of ${ALLOWED_AGENTIC_FREQUENCIES.join(', ')} `
          + `for agentic checks, got ${this.frequency}.`,
        ),
      ))
    }
  }

  synthesize () {
    return {
      ...super.synthesize(),
      checkType: CheckTypes.AGENTIC,
      prompt: this.prompt,
    }
  }
}
