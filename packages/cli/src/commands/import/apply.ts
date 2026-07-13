import { Flags } from '@oclif/core'
import prompts from 'prompts'
import logSymbols from 'log-symbols'
import chalk from 'chalk'

import * as api from '../../rest/api.js'
import { AuthCommand } from '../authCommand.js'
import commonMessages from '../../messages/common-messages.js'
import { forceFlag, planIdFlag } from '../../helpers/flags.js'
import { detectCliMode } from '../../helpers/cli-mode.js'
import { splitConfigFilePath } from '../../services/util.js'
import { loadChecklyConfig } from '../../services/checkly-config-loader.js'
import { ImportPlan } from '../../rest/projects.js'
import { BaseCommand } from '../baseCommand.js'
import { confirmCommit, performCommitAction } from './commit.js'
import { selectPlanOrExit } from '../../helpers/import-plan-selection.js'

export default class ImportApplyCommand extends AuthCommand {
  static hidden = false
  static description = 'Attach imported resources into your project in a pending state.'

  static flags = {
    'config': Flags.string({
      char: 'c',
      description: commonMessages.configFile,
    }),
    'plan-id': planIdFlag(),
    'force': forceFlag(),
  }

  async run (): Promise<void> {
    const { flags } = await this.parse(ImportApplyCommand)
    const {
      config: configFilename,
      'plan-id': planId,
      force,
    } = flags

    const { configDirectory, configFilenames } = splitConfigFilePath(configFilename)
    const {
      config: checklyConfig,
    } = await loadChecklyConfig(configDirectory, configFilenames)

    const {
      logicalId,
    } = checklyConfig

    const { data: unappliedPlans } = await api.projects.findImportPlans(logicalId, {
      onlyUnapplied: true,
    })

    if (unappliedPlans.length === 0) {
      this.style.fatal(`No plans available to apply.`)
      return
    }

    const plan = await selectPlanOrExit(
      this, unappliedPlans, planId, 'apply', () => this.#selectPlan(unappliedPlans),
    )

    await performApplyAction.call(this, plan)

    // Applying reserves the resources as pending; committing is a separate,
    // irreversible step. In non-interactive sessions (agents/CI), or when
    // --force is given, we stop here and leave finalizing to a later
    // `checkly deploy` (or an explicit `checkly import commit`).
    if (force || detectCliMode() !== 'interactive') {
      return
    }

    const commit = await confirmCommit.call(this)
    if (!commit) {
      return
    }

    await performCommitAction.call(this, plan)
  }

  async #selectPlan (plans: ImportPlan[]): Promise<ImportPlan> {
    const choices: prompts.Choice[] = plans.map((plan, index) => ({
      title: `Plan #${index + 1} from ${new Date(plan.createdAt)}`,
      value: plan.id,
      description: `ID: ${plan.id}`,
    }))

    choices.unshift({
      title: 'Exit without applying',
      value: 'exit',
      description: 'No changes will be made.',
    })

    const plansById = plans.reduce((m, plan) => m.set(plan.id, plan), new Map<string, ImportPlan>())

    const { planId } = await prompts({
      name: 'planId',
      type: 'select',
      message: `Found ${plans.length} unapplied plan(s). Which one to apply?`,
      choices,
    })
    this.log()

    if (planId === 'exit' || planId === undefined) {
      this.log('Exiting without making any changes.')
      this.exit(0)
    }

    const plan = plansById.get(planId)
    if (plan === undefined) {
      throw new Error('Bug: plan ID missing from plan map')
    }

    return plan
  }
}

export async function confirmApply (this: BaseCommand): Promise<boolean> {
  const { apply } = await prompts({
    name: 'apply',
    type: 'confirm',
    message: 'Would you like to apply the plan now?',
  })
  this.log()

  if (apply) {
    return true
  }

  this.log(`\
  To apply your plan at a later time, please run:

    ${chalk.green('npx checkly import apply')}

  To cancel the plan, run:

    ${chalk.green('npx checkly import cancel')}
`)

  return false
}

export async function performApplyAction (this: BaseCommand, plan: ImportPlan) {
  this.style.actionStart('Applying plan')

  try {
    await api.projects.applyImportPlan(plan.id)

    this.style.actionSuccess()
  } catch (err) {
    this.style.actionFailure()

    throw err
  }

  this.log(`${logSymbols.success} ${chalk.bold('Your import plan has been applied!')}`)
  this.log()
  this.log(`\
  The code generated for the import plan is now linked to the underlying
  resources. If you deploy now, you are modifying the actual resources. You
  may still cancel the plan but any changes you've deployed cannot be undone.

  ${logSymbols.info} \
${chalk.cyan('For safety, resources are not deletable until the plan has been committed.')}

  The final step will be to commit your plan, at which point the underlying
  resources will be fully managed by the Checkly CLI in the exact same
  manner as any other CLI-native resource.

  If there is any risk that a different user or a CI workflow may deploy a
  different version of this Checkly project before the imported resources can
  be merged to your codebase, you should hold off committing the plan until
  the merge is completed.

  ${logSymbols.warning} \
${chalk.yellow('The plan cannot be cancelled after it has been committed.')}
`)
}
