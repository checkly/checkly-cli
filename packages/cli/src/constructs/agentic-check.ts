import { Check, CheckProps } from './check.js'
import { Frequency } from './frequency.js'
import { Session } from './session.js'
import { CheckTypes } from '../constants.js'
import { Diagnostics } from './diagnostics.js'
import { InvalidPropertyValueDiagnostic } from './construct-diagnostics.js'

/**
 * Frequencies for agentic checks are accepted locally and enforced by the
 * backend according to the account's entitlements.
 */
export type AgenticCheckFrequency = number | Frequency

/**
 * Backwards-compatible default for checks that do not set a location and do
 * not inherit one from the project config.
 */
const DEFAULT_AGENTIC_CHECK_LOCATION = 'us-east-1'

/**
 * Configures the runtime context the agent has access to during a check.
 *
 * `agentRuntime` lets you add extra skills on top of the defaults the runner
 * provides automatically.
 */
export interface AgentRuntime {
  /**
   * Additional skills to load into the agent's runtime, on top of the
   * defaults the runner provides automatically (currently the
   * `playwright-cli` skill is preloaded for browser automation).
   *
   * Each entry is passed verbatim to `npx skills add` on the runner, so
   * any third-party skill published to [skills.sh](https://skills.sh)
   * works — not just Checkly's own. Supported identifier forms:
   *
   * - A full skills.sh URL — e.g. `'https://skills.sh/microsoft/playwright-cli/playwright-cli'`
   * - A `<owner>/<repo>` shorthand — e.g. `'addyosmani/web-quality-skills'`
   * - A plain skill name registered on skills.sh — e.g. `'cost-optimization'`
   *
   * @example ['addyosmani/web-quality-skills']
   */
  skills?: string[]
}

/**
 * Configuration properties for {@link AgenticCheck}.
 *
 * Agentic checks intentionally expose only the subset of options that the
 * Checkly platform currently supports for them. Properties such as
 * `privateLocations`, `runParallel`, `retryStrategy`, `shouldFail`,
 * `doubleCheck`, `triggerIncident` and `groupId` are omitted because the
 * platform does not yet honor them for agentic checks. They will be added back
 * as additive, non-breaking changes once support lands.
 */
export interface AgenticCheckProps extends Omit<CheckProps,
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
   * How often the check should run. The backend enforces the fastest allowed
   * cadence according to the account's entitlements. Defaults to
   * {@link Frequency.EVERY_30M}.
   *
   * @example
   * ```typescript
   * frequency: Frequency.EVERY_5M
   * // or equivalently
   * frequency: 5
   * ```
   */
  frequency?: AgenticCheckFrequency

  /**
   * Configures additional skills the agent can use during execution.
   */
  agentRuntime?: AgentRuntime
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
  readonly agentRuntime?: AgentRuntime

  /**
   * Constructs the Agentic Check instance.
   *
   * @param logicalId unique project-scoped resource name identification
   * @param props check configuration properties
   */
  constructor (logicalId: string, props: AgenticCheckProps) {
    super(logicalId, props)
    this.prompt = props.prompt
    this.agentRuntime = props.agentRuntime

    // Preserve the old implicit single-region behavior for checks that do not
    // set locations directly and do not inherit project-level locations.
    this.locations ??= [DEFAULT_AGENTIC_CHECK_LOCATION]

    // Defensive overrides: even though these props are omitted from the type,
    // `Check.applyConfigDefaults()` may pull them in from the project-level
    // `checks` config defaults. Force them to values the platform currently
    // honors so the construct never claims to support something it doesn't.
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

    this.validateAgentRuntime(diagnostics)
  }

  // eslint-disable-next-line require-await
  protected async validateAgentRuntime (diagnostics: Diagnostics): Promise<void> {
    if (this.agentRuntime?.skills) {
      for (const [index, skill] of this.agentRuntime.skills.entries()) {
        if (typeof skill !== 'string' || skill.trim().length === 0) {
          diagnostics.add(new InvalidPropertyValueDiagnostic(
            'agentRuntime.skills',
            new Error(
              `"agentRuntime.skills[${index}]" must be a non-empty string.`,
            ),
          ))
        }
      }
    }
  }

  synthesize () {
    return {
      ...super.synthesize(),
      checkType: CheckTypes.AGENTIC,
      prompt: this.prompt,
      // Always emit `agentRuntime` so the backend has an explicit picture of
      // the skills the user wants. Omitted skills mean "the agent should not
      // have them", not "preserve whatever was there before".
      agentRuntime: {
        skills: this.agentRuntime?.skills ?? [],
      },
    }
  }
}
