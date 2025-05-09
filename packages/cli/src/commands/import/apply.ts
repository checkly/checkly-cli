import { Flags, ux } from '@oclif/core'
import prompts from 'prompts'
import logSymbols from 'log-symbols'
import chalk from 'chalk'

import * as api from '../../rest/api'
import { AuthCommand } from '../authCommand'
import commonMessages from '../../messages/common-messages'
import { splitConfigFilePath } from '../../services/util'
import { loadChecklyConfig } from '../../services/checkly-config-loader'
import { ImportPlan } from '../../rest/projects'
import { BaseCommand } from '../baseCommand'
import { confirmCommit, performCommitAction } from './commit'

export default class ImportApplyCommand extends AuthCommand {
  static hidden = false
  static description = 'Attach imported resources into your project in a pending state.'

  static flags = {
    config: Flags.string({
      char: 'c',
      description: commonMessages.configFile,
    }),
  }

  async run (): Promise<void> {
    const { flags } = await this.parse(ImportApplyCommand)
    const {
      config: configFilename,
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
      this.log(`${chalk.red('No plans available to apply.')}`)
      return
    }

    const plan = await this.#selectPlan(unappliedPlans)

    await performApplyAction.call(this, plan)

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

  if (apply) {
    return true
  }

  this.log()
  this.log(`\
  To apply your plan at a later time, please run:

    npx checkly import apply

  To cancel the plan, run:

    npx checkly import cancel
`)

  return false
}

export async function performApplyAction (this: BaseCommand, plan: ImportPlan) {
  if (this.fancy) {
    ux.action.start('Applying plan')
  }

  try {
    await api.projects.applyImportPlan(plan.id)

    if (this.fancy) {
      ux.action.stop('✅ ')
      this.log()
    }
  } catch (err) {
    if (this.fancy) {
      ux.action.stop('❌')
      this.log()
    }

    throw err
  }

  this.log(`${logSymbols.success} ${chalk.bold('Your import plan has been applied!')}`)
  this.log()
  this.log(`\
  The code generated for the import plan is now linked to the underlying
  resources. In other words, if you deploy now, you are modifying the actual
  resources. You may still cancel the plan but any changes you've deployed
  cannot be undone.

  ${logSymbols.info} \
${chalk.cyan('For safety, resources are not deletable until the plan has been committed.')}

  The final step will be to commit your plan, at which point the underlying
  resources will be fully managed by the Checkly CLI in the exact same
  manner as any other CLI-native resource.

  ${logSymbols.warning} \
${chalk.yellow('The plan cannot be cancelled after it has been committed.')}
`)
}
