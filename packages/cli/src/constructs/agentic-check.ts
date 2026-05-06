import { Check, CheckProps } from './check'
import { Frequency } from './frequency'
import { Session } from './project'
import { CheckTypes } from '../constants'
import { Diagnostics } from './diagnostics'
import { InvalidPropertyValueDiagnostic } from './construct-diagnostics'

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
 * Maximum length of an environment variable description, in characters.
 * Matches the truncation length applied by the agentic runner.
 */
const MAX_ENV_VAR_DESCRIPTION_LENGTH = 200

/**
 * An environment variable the agent is permitted to read at runtime.
 *
 * Use the bare string form when the variable name is self-explanatory, or
 * the object form to provide a `description` that helps the agent understand
 * what the variable is for. Descriptions are passed to the model so it can
 * make better decisions about when to read the variable.
 *
 * @example
 * ```typescript
 * 'API_KEY'
 * { name: 'TOKEN_42', description: 'Feature flag service auth token' }
 * ```
 */
export type AgentRuntimeEnvironmentVariable =
  | string
  | {
    /** The environment variable name. */
    name: string
    /**
     * Optional human-readable explanation of what the variable is for.
     * Passed to the agent so it can decide when to read the variable.
     * Truncated to {@link MAX_ENV_VAR_DESCRIPTION_LENGTH} characters.
     */
    description?: string
  }

/**
 * Configures the runtime context the agent has access to during a check.
 *
 * `agentRuntime` is the explicit allowlist of resources the agent may use
 * at execution time. Anything not declared here is unavailable to the agent.
 * Treat it as a security boundary: the smaller the runtime surface, the
 * smaller the blast radius of any prompt injection.
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

  /**
   * Environment variables the agent is permitted to read at runtime.
   *
   * **Variables not listed here are not exposed to the agent**, even if
   * they exist in the Checkly account. This is the primary defense against
   * prompt injection: an attacker who controls content the agent reads
   * cannot exfiltrate secrets the agent never had access to.
   *
   * Each entry is either a bare variable name, or an object with a
   * `name` and an optional `description`. Descriptions help the agent
   * understand what each variable is for.
   *
   * @example
   * ```typescript
   * exposeEnvironmentVariables: [
   *   'API_KEY',
   *   { name: 'TEST_USER_PASSWORD', description: 'Login password for the test account' },
   * ]
   * ```
   */
  exposeEnvironmentVariables?: AgentRuntimeEnvironmentVariable[]
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
   * Configures the runtime context the agent has access to during execution:
   * which skills it can use, which environment variables it can read, and
   * (in the future) other access surfaces such as network policies or tool
   * allowlists.
   *
   * Treat `agentRuntime` as a security boundary. Anything not declared here
   * is unavailable to the agent at runtime, which keeps the blast radius of
   * any prompt injection as small as possible.
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

    if (this.agentRuntime?.exposeEnvironmentVariables) {
      for (const [index, entry] of this.agentRuntime.exposeEnvironmentVariables.entries()) {
        const name = typeof entry === 'string' ? entry : entry?.name
        if (typeof name !== 'string' || name.trim().length === 0) {
          diagnostics.add(new InvalidPropertyValueDiagnostic(
            'agentRuntime.exposeEnvironmentVariables',
            new Error(
              `"agentRuntime.exposeEnvironmentVariables[${index}]" must have a non-empty name.`,
            ),
          ))
          continue
        }

        if (typeof entry !== 'string'
          && typeof entry.description === 'string'
          && entry.description.length > MAX_ENV_VAR_DESCRIPTION_LENGTH) {
          diagnostics.add(new InvalidPropertyValueDiagnostic(
            'agentRuntime.exposeEnvironmentVariables',
            new Error(
              `"agentRuntime.exposeEnvironmentVariables[${index}].description" must be at most `
              + `${MAX_ENV_VAR_DESCRIPTION_LENGTH} characters, got ${entry.description.length}.`,
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
      // Always emit `agentRuntime` so the backend has an explicit, complete
      // picture of the runtime surface the user wants. The CLI is the source
      // of truth: omitted skills/env vars mean "the agent should not have
      // them", not "preserve whatever was there before".
      agentRuntime: {
        skills: this.agentRuntime?.skills ?? [],
        exposeEnvironmentVariables: this.agentRuntime?.exposeEnvironmentVariables ?? [],
      },
    }
  }
}
