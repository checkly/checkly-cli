import { Flags } from '@oclif/core'
import prompts from 'prompts'
import logSymbols from 'log-symbols'
import chalk from 'chalk'

import * as api from '../../rest/api.js'
import { AuthCommand } from '../authCommand.js'
import commonMessages from '../../messages/common-messages.js'
import { planIdFlag } from '../../helpers/flags.js'
import { splitConfigFilePath } from '../../services/util.js'
import { loadChecklyConfig } from '../../services/checkly-config-loader.js'
import { ImportPlan } from '../../rest/projects.js'
import { BaseCommand } from '../baseCommand.js'
import { selectPlanOrExit } from '../../helpers/import-plan-selection.js'

export default class ImportCommitCommand extends AuthCommand {
  static hidden = false
  static description = 'Permanently commit imported resources into your project.'

  static flags = {
    'config': Flags.string({
      char: 'c',
      description: commonMessages.configFile,
    }),
    'plan-id': planIdFlag(),
  }

  async run (): Promise<void> {
    const { flags } = await this.parse(ImportCommitCommand)
    const {
      config: configFilename,
      'plan-id': planId,
    } = flags

    const { configDirectory, configFilenames } = splitConfigFilePath(configFilename)
    const {
      config: checklyConfig,
    } = await loadChecklyConfig(configDirectory, configFilenames)

    const {
      logicalId,
    } = checklyConfig

    const { data } = await api.projects.findImportPlans(logicalId, {
      onlyUncommitted: true,
    })

    // Uncommitted plans also include unapplied plans, filter them out.
    const uncommittedPlans = data.filter(plan => {
      return plan.appliedAt
    })

    if (uncommittedPlans.length === 0) {
      this.style.fatal(`No plans available to commit.`)
      return
    }

    const plan = await selectPlanOrExit(
      this, uncommittedPlans, planId, 'commit', () => this.#selectPlan(uncommittedPlans),
    )

    await performCommitAction.call(this, plan)
  }

  async #selectPlan (plans: ImportPlan[]): Promise<ImportPlan> {
    const choices: prompts.Choice[] = plans.map((plan, index) => ({
      title: `Plan #${index + 1} from ${new Date(plan.createdAt)}`,
      value: plan.id,
      description: `ID: ${plan.id}`,
    }))

    choices.unshift({
      title: 'Exit without committing',
      value: 'exit',
      description: 'No changes will be made.',
    })

    const plansById = plans.reduce((m, plan) => m.set(plan.id, plan), new Map<string, ImportPlan>())

    const { planId } = await prompts({
      name: 'planId',
      type: 'select',
      message: `Found ${plans.length} applied plan(s). Which one to commit?`,
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

export async function confirmCommit (this: BaseCommand): Promise<boolean> {
  const { commit } = await prompts({
    name: 'commit',
    type: 'confirm',
    message: 'Would you like to commit the plan now?',
  })
  this.log()

  if (commit) {
    return true
  }

  this.log(`\
  To commit your plan at a later time, please run:

    ${chalk.green('npx checkly import commit')}

  To cancel the plan, run:

    ${chalk.green('npx checkly import cancel')}
`)

  return false
}

export async function performCommitAction (this: BaseCommand, plan: ImportPlan): Promise<void> {
  this.style.actionStart('Committing plan')

  try {
    await api.projects.commitImportPlan(plan.id)

    this.style.actionSuccess()
  } catch (err) {
    this.style.actionFailure()

    throw err
  }

  this.log(`${logSymbols.success} ${chalk.bold('Your import plan has been committed!')}`)
  this.log()
  this.log(`\
  The underlying resources are now fully managed by the Checkly CLI the same
  way as any other CLI-native resource, and the import process is finished.

  Enjoy!
`)
}
