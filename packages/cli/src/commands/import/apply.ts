import { Flags, ux } from '@oclif/core'
import prompts from 'prompts'

import * as api from '../../rest/api'
import { AuthCommand } from '../authCommand'
import commonMessages from '../../messages/common-messages'
import { splitConfigFilePath } from '../../services/util'
import { loadChecklyConfig } from '../../services/checkly-config-loader'
import { ImportPlan } from '../../rest/projects'

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

    const plan = await this.#selectPlan(unappliedPlans)

    if (this.fancy) {
      ux.action.start('Applying plan')
    }

    try {
      await api.projects.applyImportPlan(plan.id)

      if (this.fancy) {
        ux.action.stop('✅ ')
      }
    } catch (err) {
      if (this.fancy) {
        ux.action.stop('❌')
      }

      throw err
    }
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

    if (planId === 'exit') {
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
