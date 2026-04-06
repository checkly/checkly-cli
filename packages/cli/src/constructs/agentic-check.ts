import { Check, CheckProps } from './check'
import { Session } from './project'
import { CheckTypes } from '../constants'
import { Diagnostics } from './diagnostics'
import { InvalidPropertyValueDiagnostic } from './construct-diagnostics'

export interface AgenticCheckProps extends CheckProps {
  /**
   * The prompt that defines what the agentic check should verify.
   * Maximum 10,000 characters.
   */
  prompt: string
}

/**
 * Creates an Agentic Check that uses AI to monitor websites and applications.
 *
 * Agentic checks use a prompt to define what should be verified, without requiring
 * traditional scripts. The AI agent interprets the prompt and performs the checks.
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
 *   activated: true,
 *   frequency: 30,
 *   locations: ['us-east-1', 'eu-west-1'],
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
    Session.registerConstruct(this)
    this.addSubscriptions()
    this.addPrivateLocationCheckAssignments()
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

    if (this.frequency !== undefined && this.frequency < 30) {
      diagnostics.add(new InvalidPropertyValueDiagnostic(
        'frequency',
        new Error('"frequency" must be at least 30 for agentic checks.'),
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
