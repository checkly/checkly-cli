import { ImportPlan } from '../rest/projects.js'
import { detectCliMode } from './cli-mode.js'
import { BaseCommand } from '../commands/baseCommand.js'

export class PlanSelectionError extends Error {
  constructor (message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'PlanSelectionError'
  }
}

/**
 * Resolves a single import plan without prompting when possible, so that agents
 * and CI can drive the import commands headlessly:
 *
 * - When `planId` is given, the matching plan is selected (works in any mode).
 * - Otherwise, in a non-interactive (agent/CI) session, a single candidate plan
 *   is auto-selected; multiple candidates require an explicit `--plan-id`.
 *
 * Returns `undefined` when the caller should fall back to interactive selection,
 * i.e. an interactive session with no `--plan-id`. This keeps the existing
 * interactive behavior untouched.
 *
 * @throws {PlanSelectionError} when the requested plan id does not exist, or
 *   when selection is ambiguous in a non-interactive session.
 */
export function resolvePlanNonInteractively (
  plans: ImportPlan[],
  planId: string | undefined,
  action: string,
): ImportPlan | undefined {
  if (planId !== undefined) {
    const plan = plans.find(candidate => candidate.id === planId)
    if (plan === undefined) {
      throw new PlanSelectionError(
        `No plan available to ${action} with ID "${planId}".`,
      )
    }
    return plan
  }

  if (detectCliMode() === 'interactive') {
    return undefined
  }

  if (plans.length === 1) {
    return plans[0]
  }

  throw new PlanSelectionError(
    `Found ${plans.length} plan(s) available to ${action}. `
    + `Re-run with --plan-id <id> to choose one non-interactively.`,
  )
}

/**
 * Resolves a single import plan for a command, falling back to interactive
 * selection when appropriate. On an unrecoverable {@link PlanSelectionError}
 * (unknown `--plan-id`, or an ambiguous non-interactive selection) it reports
 * the error and exits with a non-zero code so agents/CI observe the failure.
 */
export async function selectPlanOrExit (
  command: BaseCommand,
  plans: ImportPlan[],
  planId: string | undefined,
  action: string,
  interactiveFallback: () => Promise<ImportPlan>,
): Promise<ImportPlan> {
  try {
    return resolvePlanNonInteractively(plans, planId, action)
      ?? await interactiveFallback()
  } catch (err) {
    if (err instanceof PlanSelectionError) {
      command.style.fatal(err.message)
      return command.exit(1)
    }

    throw err
  }
}

/**
 * Resolves one or more import plans for a bulk command (e.g. `import cancel`),
 * falling back to interactive multi-selection when appropriate.
 *
 * - `--all` selects every candidate plan without prompting.
 * - `--all` and `--plan-id` are mutually exclusive: rather than silently letting
 *   one win, the contradictory combination is rejected. This matters most for
 *   the destructive `cancel` command driven by an agent that assembles flags
 *   programmatically.
 * - Otherwise a single plan is resolved via {@link resolvePlanNonInteractively},
 *   falling back to interactive selection when it returns `undefined`.
 *
 * On an unrecoverable {@link PlanSelectionError} it reports the error and exits
 * with a non-zero code so agents/CI observe the failure.
 */
export async function selectPlansOrExit (
  command: BaseCommand,
  plans: ImportPlan[],
  { all, planId }: { all: boolean, planId: string | undefined },
  action: string,
  interactiveFallback: () => Promise<ImportPlan[]>,
): Promise<ImportPlan[]> {
  try {
    if (all && planId !== undefined) {
      throw new PlanSelectionError(`--all and --plan-id cannot be used together.`)
    }

    if (all) {
      return plans
    }

    const plan = resolvePlanNonInteractively(plans, planId, action)
    return plan !== undefined ? [plan] : await interactiveFallback()
  } catch (err) {
    if (err instanceof PlanSelectionError) {
      command.style.fatal(err.message)
      return command.exit(1)
    }

    throw err
  }
}
