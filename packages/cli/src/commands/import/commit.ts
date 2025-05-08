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

export default class ImportCommitCommand extends AuthCommand {
  static hidden = false
  static description = 'Permanently commit imported resources into your project.'

  static flags = {
    config: Flags.string({
      char: 'c',
      description: commonMessages.configFile,
    }),
  }

  async run (): Promise<void> {
    const { flags } = await this.parse(ImportCommitCommand)
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

    const { data } = await api.projects.findImportPlans(logicalId, {
      onlyUncommitted: true,
    })

    // Uncommitted plans also include unapplied plans, filter them out.
    const uncommittedPlans = data.filter(plan => {
      return plan.appliedAt
    })

    if (uncommittedPlans.length === 0) {
      this.log(`${chalk.red('No plans available to commit.')}`)
      return
    }

    const plan = await this.#selectPlan(uncommittedPlans)

    if (this.fancy) {
      ux.action.start('Committing plan')
    }

    try {
      await api.projects.commitImportPlan(plan.id)

      if (this.fancy) {
        ux.action.stop('✅ ')
      }
    } catch (err) {
      if (this.fancy) {
        ux.action.stop('❌')
      }

      throw err
    }

    this.log(`${logSymbols.success} All imported plan resources are now fully managed by the Checkly CLI.`)
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
