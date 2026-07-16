import { Flags } from '@oclif/core'
import prompts from 'prompts'

import * as api from '../../rest/api.js'
import { AuthCommand } from '../authCommand.js'
import commonMessages from '../../messages/common-messages.js'
import { dryRunFlag, forceFlag, planIdFlag } from '../../helpers/flags.js'
import { splitConfigFilePath } from '../../services/util.js'
import { loadChecklyConfig } from '../../services/checkly-config-loader.js'
import { ImportPlan } from '../../rest/projects.js'
import {
  reportNoCandidatePlans,
  selectPlansOrExit,
  validatePlanFlagsOrExit,
} from '../../helpers/import-plan-selection.js'

export default class ImportCancelCommand extends AuthCommand {
  static hidden = false
  static destructive = true
  static idempotent = true
  static description = 'Cancels an ongoing import plan that has not been committed yet.'

  static flags = {
    'config': Flags.string({
      char: 'c',
      description: commonMessages.configFile,
    }),
    'all': Flags.boolean({
      description: 'Cancel all plans.',
      default: false,
    }),
    'plan-id': planIdFlag(),
    'force': forceFlag(),
    'dry-run': dryRunFlag(),
  }

  async run (): Promise<void> {
    const { flags } = await this.parse(ImportCancelCommand)
    const {
      config: configFilename,
      all,
      'plan-id': planId,
    } = flags

    // Validated before any plans are fetched: a contradictory command line is
    // wrong regardless of what happens to exist remotely.
    validatePlanFlagsOrExit(this, { all, planId })

    const { configDirectory, configFilenames } = splitConfigFilePath(configFilename)
    const {
      config: checklyConfig,
    } = await loadChecklyConfig(configDirectory, configFilenames)

    const {
      logicalId,
    } = checklyConfig

    const { data: cancelablePlans } = await api.projects.findImportPlans(logicalId, {
      onlyUncommitted: true,
    })

    const noPlans = reportNoCandidatePlans(this, cancelablePlans, {
      planId,
      action: 'cancel',
      nothingToDo: 'Nothing to cancel — no uncommitted import plans found.',
    })
    if (noPlans) {
      return
    }

    const plans = await selectPlansOrExit(
      this, cancelablePlans, { all, planId }, 'cancel', () => this.#selectPlans(cancelablePlans),
    )

    // A single target is pinned by ID so the confirming run cannot resolve to a
    // different plan. Cancelling every plan can only be expressed as --all,
    // which re-resolves by design: it means "whatever is uncommitted".
    // `all: false` is dropped rather than passed through, because
    // `buildConfirmCommand` renders a false boolean as `--no-all`, which is not
    // a flag this command accepts.
    const previewFlags = plans.length > 1
      ? { ...flags, 'all': true, 'plan-id': undefined }
      : { ...flags, 'all': undefined, 'plan-id': plans[0].id }

    await this.confirmOrAbort({
      command: 'import cancel',
      description: 'Cancel import plan(s)',
      changes: plans.map(plan => `Cancel import plan ${plan.id}, discarding its generated code links`),
      flags: previewFlags,
      classification: {
        readOnly: ImportCancelCommand.readOnly,
        destructive: ImportCancelCommand.destructive,
        idempotent: ImportCancelCommand.idempotent,
      },
    }, { force: flags.force, dryRun: flags['dry-run'] })

    this.style.actionStart('Canceling plan(s)')

    try {
      for (const plan of plans) {
        await api.projects.cancelImportPlan(plan.id)
        this.style.shortSuccess(`Canceled plan ${plan.id}`)
      }

      this.style.actionSuccess()
    } catch (err) {
      this.style.actionFailure()

      throw err
    }
  }

  async #selectPlans (plans: ImportPlan[]): Promise<ImportPlan[]> {
    const choices: prompts.Choice[] = plans.map((plan, index) => ({
      title: `Plan #${index + 1} from ${new Date(plan.createdAt)}`,
      value: plan.id,
      description: `ID: ${plan.id}`,
    }))

    choices.unshift({
      title: 'Exit without canceling',
      value: 'exit',
      description: 'No changes will be made.',
    })

    if (plans.length > 0) {
      choices.push({
        title: 'Cancel all plans',
        value: 'all',
        description: 'All uncommitted plans will be canceled.',
      })
    }

    const plansById = plans.reduce((m, plan) => m.set(plan.id, plan), new Map<string, ImportPlan>())

    const { planId } = await prompts({
      name: 'planId',
      type: 'select',
      message: `Found ${plans.length} cancelable plan(s). Which one to cancel?`,
      choices,
    })
    this.log()

    if (planId === 'exit' || planId === undefined) {
      this.log('Exiting without making any changes.')
      this.exit(0)
    }

    if (planId === 'all') {
      return plans
    }

    const plan = plansById.get(planId)
    if (plan === undefined) {
      throw new Error('Bug: plan ID missing from plan map')
    }

    return [plan]
  }
}
