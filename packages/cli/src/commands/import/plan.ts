import { writeFileSync } from 'node:fs'
import { Flags, ux } from '@oclif/core'
import prompts from 'prompts'
import chalk from 'chalk'
import { isAxiosError } from 'axios'
import logSymbols from 'log-symbols'

import * as api from '../../rest/api'
import { AuthCommand } from '../authCommand'
import commonMessages from '../../messages/common-messages'
import { splitConfigFilePath } from '../../services/util'
import { loadChecklyConfig } from '../../services/checkly-config-loader'
import { ImportPlan } from '../../rest/projects'
import { Program, Output } from '../../sourcegen'
import { ConstructCodegen, sortResources } from '../../constructs/construct-codegen'
import { Context } from '../../constructs/internal/codegen'

export default class ImportPlanCommand extends AuthCommand {
  static hidden = false
  static description = 'Begin the import process by creating a plan.'

  static flags = {
    config: Flags.string({
      char: 'c',
      description: commonMessages.configFile,
    }),
  }

  async run (): Promise<void> {
    const { flags } = await this.parse(ImportPlanCommand)
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

    const { data: existingPlans } = await api.projects.findImportPlans(logicalId, {
      onlyUncommitted: true,
    })

    if (existingPlans.length !== 0) {
      await this.#handleExistingPlans(existingPlans)
    }

    if (this.fancy) {
      ux.action.start('Creating a new plan', undefined, { stdout: true })
    }

    let plan: ImportPlan

    try {
      const { data } = await api.projects.createImportPlan(logicalId)
      plan = data

      if (this.fancy) {
        ux.action.stop('✅ ')
      }
    } catch (err) {
      if (this.fancy) {
        ux.action.stop('❌')
      }

      if (isAxiosError(err)) {
        if (err.response?.status === 404) {
          const message = err.response?.data.message
          if (message) {
            this.log(chalk.red(message))
            return
          }
        }
      }

      throw err
    }

    this.#generateCode(plan)
  }

  #generateCode (plan: ImportPlan) {
    if (this.fancy) {
      ux.action.start('Generating Checkly constructs for imported resources', undefined, { stdout: true })
    }

    try {
      const program = new Program()
      const codegen = new ConstructCodegen(program)
      const context = new Context()

      if (plan.changes) {
        sortResources(plan.changes.resources as any)

        for (const resource of plan.changes.resources) {
          codegen.prepare(resource.logicalId, resource as any, context)
        }

        for (const resource of plan.changes.resources) {
          codegen.gencode(resource.logicalId, resource as any, context)
        }
      }

      if (this.fancy) {
        ux.action.stop('✅ ')
      }

      const output = new Output()
      program.render(output)

      // TODO: file structure
      const filename = './generated.check.ts'

      writeFileSync(filename, output.finalize())

      this.log(`${logSymbols.success} Generated code can be found in ${chalk.bold(filename)}`)
    } catch (err) {
      if (this.fancy) {
        ux.action.stop('❌')
      }

      throw err
    }
  }

  async #handleExistingPlans (plans: ImportPlan[]) {
    const choices: prompts.Choice[] = [{
      title: 'I want to exit and rethink',
      value: 'exit',
      description: 'No changes will be made.',
    }, {
      title: 'I want to see some basic details about the existing plans first',
      value: 'show',
    }, {
      title: 'I want to cancel all existing plans and create a new plan',
      value: 'cancel-proceed',
    }, {
      title: 'I want to create a new plan regardless',
      value: 'new',
    }]

    while (true) {
      const { action } = await prompts({
        name: 'action',
        type: 'select',
        message: `Found ${plans.length} existing uncommitted plan(s). How do you want to proceed?`,
        choices,
      })

      switch (action) {
        case 'exit': {
          this.log('Exiting without making any changes.')
          this.exit(0)
          return
        }
        case 'show': {
          this.log()
          for (const plan of plans) {
            this.log(`Plan ${plan.id}:`)
            this.log(`  Created at: ${new Date(plan.createdAt)}`)
            this.log(`  Applied?:   ${plan.appliedAt ? 'yes' : 'no'}`)
            if (plan.appliedAt) {
              this.log(`  Applied at: ${new Date(plan.appliedAt)}`)
            }
            this.log()
          }

          const { action } = await prompts({
            name: 'action',
            type: 'select',
            message: 'Do you want to exit or retry?',
            choices: [{
              title: 'Exit',
              value: 'exit',
              description: 'No changes will be made.',
            }, {
              title: 'Return to previous options',
              value: 'return',
            }],
          })

          if (action === 'exit') {
            this.log('Exiting without making any changes.')
            this.exit(0)
            return
          }

          continue
        }
        case 'cancel-proceed': {
          if (this.fancy) {
            ux.action.start('Cancelling existing plans', undefined, { stdout: true })
          }

          try {
            for (const plan of plans) {
              await api.projects.cancelImportPlan(plan.id)
              this.log(`${logSymbols.success} Cancelled plan ${plan.id}`)
            }

            if (this.fancy) {
              ux.action.stop('✅ ')
            }
          } catch (err) {
            if (this.fancy) {
              ux.action.stop('❌')
            }

            throw err
          }

          return
        }
        case 'new': {
          return
        }
      }
    }
  }
}
