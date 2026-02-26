import { Flags } from '@oclif/core'
import prompts from 'prompts'

import * as api from '../../rest/api'
import { AuthCommand } from '../authCommand'
import commonMessages from '../../messages/common-messages'
import { splitConfigFilePath } from '../../services/util'
import { loadChecklyConfig } from '../../services/checkly-config-loader'
import { ImportPlan } from '../../rest/projects'

export default class ImportCancelCommand extends AuthCommand {
  static hidden = false
  static idempotent = true
  static description = 'Cancels an ongoing import plan that has not been committed yet.'

  static flags = {
    config: Flags.string({
      char: 'c',
      description: commonMessages.configFile,
    }),
    all: Flags.boolean({
      description: 'Cancel all plans.',
      default: false,
    }),
  }

  async run (): Promise<void> {
    const { flags } = await this.parse(ImportCancelCommand)
    const {
      config: configFilename,
      all,
    } = flags

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

    if (cancelablePlans.length === 0) {
      this.style.fatal(`No plans available to cancel.`)
      return
    }

    const plans = all
      ? cancelablePlans
      : await this.#selectPlans(cancelablePlans)

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
