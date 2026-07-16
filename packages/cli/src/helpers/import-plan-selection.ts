import { ImportPlan } from '../rest/projects.js'
import { detectCliMode } from './cli-mode.js'
import { BaseCommand } from '../commands/baseCommand.js'

export class PlanSelectionError extends Error {
  constructor (message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'PlanSelectionError'
  }
}

export interface PlanFlags {
  all?: boolean
  planId?: string
}

function describePlan (plan: ImportPlan): string {
  const details = [`created ${plan.createdAt}`]

  if (plan.appliedAt !== undefined) {
    details.push(`applied ${plan.appliedAt}`)
  }

  return `  ${plan.id}  (${details.join(', ')})`
}

/**
 * Returns the reason a flag combination is contradictory, or `undefined` when
 * the combination is valid. Contradictions never depend on remote state.
 */
function planFlagsConflict ({ all, planId }: PlanFlags): string | undefined {
  if (all === true && planId !== undefined) {
    return '--all and --plan-id cannot be used together.'
  }

  return undefined
}

/**
 * Rejects contradictory flag combinations before any plans are fetched, so that
 * an impossible command line fails identically whether or not plans happen to
 * exist remotely.
 */
export function validatePlanFlagsOrExit (command: BaseCommand, flags: PlanFlags): void {
  const conflict = planFlagsConflict(flags)
  if (conflict !== undefined) {
    command.style.fatal(conflict)
    command.exit(1)
  }
}

/**
 * Reports the "no candidate plans" case, returning `true` when the caller should
 * stop.
 *
 * An explicit `--plan-id` that cannot be satisfied is a failure and exits 1, so
 * that agents and CI observe it. Having nothing to do when no specific plan was
 * requested is not a failure: it exits 0 and reads as information rather than an
 * error.
 */
export function reportNoCandidatePlans (
  command: BaseCommand,
  plans: ImportPlan[],
  options: { planId?: string, action: string, nothingToDo: string },
): boolean {
  if (plans.length > 0) {
    return false
  }

  if (options.planId !== undefined) {
    command.style.fatal(`No plan available to ${options.action} with ID "${options.planId}".`)
    command.exit(1)
  }

  command.log(options.nothingToDo)
  return true
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

  // A non-interactive caller cannot discover plan IDs on its own — there is no
  // plan listing command — so an ambiguous selection has to name the candidates
  // it is asking the caller to choose between.
  throw new PlanSelectionError(
    `Found ${plans.length} plans available to ${action}. `
    + `Re-run with --plan-id <id> to choose one:\n\n`
    + `${plans.map(describePlan).join('\n')}\n`,
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
 * - `--all` and `--plan-id` are mutually exclusive. Commands are expected to
 *   reject the combination up front via {@link validatePlanFlagsOrExit}; the
 *   check is repeated here so the helper is safe to call on its own.
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
    const conflict = planFlagsConflict({ all, planId })
    if (conflict !== undefined) {
      throw new PlanSelectionError(conflict)
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
