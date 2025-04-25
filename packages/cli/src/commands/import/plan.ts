import fs from 'node:fs/promises'
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
import { Program } from '../../sourcegen'
import { ConstructCodegen, sortResources } from '../../constructs/construct-codegen'
import { Context } from '../../constructs/internal/codegen'
import {
  isSnippet,
  isSafeSnippetFilename,
} from '../../constructs/internal/codegen/snippet'
import { StaticAuxiliaryFile } from '../../sourcegen/program'

export default class ImportPlanCommand extends AuthCommand {
  static hidden = false
  static description = 'Begin the import process by creating a plan.'

  static flags = {
    config: Flags.string({
      char: 'c',
      description: commonMessages.configFile,
    }),
    root: Flags.string({
      description: 'The root folder in which to write generated code files.',
      default: '.',
    }),
    'debug-import-plan': Flags.boolean({
      description: 'Output the import plan to a file.',
      default: false,
      hidden: true,
    }),
    'debug-import-plan-output-file': Flags.string({
      description: 'The file to output the import plan to.',
      default: './debug-import-plan.json',
      hidden: true,
    }),
  }

  async run (): Promise<void> {
    const { flags } = await this.parse(ImportPlanCommand)
    const {
      config: configFilename,
      root: rootDirectory,
      'debug-import-plan': debugImportPlan,
      'debug-import-plan-output-file': debugImportPlanOutputFile,
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

    if (debugImportPlan) {
      const output = JSON.stringify(plan, null, 2)
      await fs.writeFile(debugImportPlanOutputFile, output, 'utf8')
      this.log(`Successfully wrote debug import plan to "${debugImportPlanOutputFile}".`)
      return
    }

    try {
      const program = new Program({
        rootDirectory,
        constructFileSuffix: '.check',
        specFileSuffix: '.spec',
        language: 'typescript',
      })

      this.#generateCode(plan, program)

      if (this.fancy) {
        ux.action.start('Writing files', undefined, { stdout: true })
      }

      try {
        await program.realize()

        if (this.fancy) {
          ux.action.stop('✅ ')
        }
      } catch (err) {
        if (this.fancy) {
          ux.action.stop('❌')
        }

        throw err
      }

      this.log(`${logSymbols.success} Successfully generated the following files for your import plan:`)
      for (const filePath of program.paths) {
        this.log(`  - ${chalk.green(filePath)}`)
      }
    } catch (err) {
      try {
        const output = JSON.stringify(plan, null, 2)
        await fs.writeFile(debugImportPlanOutputFile, output, 'utf8')
        this.log(`${logSymbols.warning} Please contact Checkly support at support@checklyhq.com and attach the newly created "${debugImportPlanOutputFile}" file.`)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (err) {
        this.log(`${logSymbols.warning} Please contact Checkly support at support@checklyhq.com.`)
      }

      throw err
    }
  }

  #generateCode (plan: ImportPlan, program: Program): void {
    if (this.fancy) {
      ux.action.start('Generating Checkly constructs for imported resources', undefined, { stdout: true })
    }

    try {
      const codegen = new ConstructCodegen(program)
      const context = new Context()

      if (plan.changes) {
        const { resources, auxiliary } = plan.changes

        if (auxiliary) {
          const globalSnippetFiles = new Set<StaticAuxiliaryFile>()

          for (const resource of auxiliary) {
            try {
              switch (resource.type) {
                case 'snippet': {
                  const snippet = resource.payload

                  if (!isSnippet(snippet)) {
                    throw new Error(`Invalid auxiliary snippet`)
                  }

                  const snippetFilePath = context.filePath('snippets', snippet.name, {
                    unique: false,
                    contentKey: `snippet::${snippet.id}`,
                    case: isSafeSnippetFilename(snippet.name) ? 'identity' : 'kebab-case',
                  })

                  const snippetFile = program.staticSupportFile(
                    snippetFilePath.fullPath,
                    snippet.script,
                  )

                  globalSnippetFiles.add(snippetFile)

                  context.registerAuxiliarySnippetFile(snippet.id, snippetFile)

                  break
                }
                default:
                  throw new Error(`Unable to process unsupported auxiliary resource type '${resource.type}'.`)
              }
            } catch (cause) {
              throw new Error(`Failed to process auxiliary resource '${resource.type}:${resource.physicalId}': ${cause}`, { cause })
            }
          }

          // Due to questionable historical design choices, snippets may
          // reference other snippets in two ways:
          //
          // 1. From the same folder (i.e. `require('./other-snippet')`) if
          //    the requiring snippet is NOT the main entrypoint, but has
          //    itself been required by another snippet or script.
          // 2. From the magic './snippets' folder using
          //    `require('./snippets/other-snippet')` irrespective of whether
          //    the requiring snippet is the main entrypoint or not (works in
          //    either case).
          //
          // To emulate this functionality with a proper file structure, we
          // need to check if any global snippets are using the second method,
          // and create appropriate aliases in the beatifully named
          // './snippets/snippets/' folder so that the paths can resolve
          // without modification.
          for (const globalSnippetFile of globalSnippetFiles) {
            const content = globalSnippetFile.content.toString()
            const snippetFiles = context.findScriptSnippetFiles(content)
            for (const snippetFile of snippetFiles) {
              const localSnippetFile = program.generatedSupportFile(`snippets/snippets/${snippetFile.basename}`)
              localSnippetFile.plainImport(localSnippetFile.relativePath(snippetFile))
            }
          }
        }

        sortResources(resources as any)

        for (const resource of resources) {
          try {
            codegen.prepare(resource.logicalId, resource as any, context)
          } catch (cause) {
            throw new Error(`Failed to prepare resource '${resource.type}:${resource.logicalId}': ${cause}`, { cause })
          }
        }

        for (const resource of resources) {
          try {
            codegen.gencode(resource.logicalId, resource as any, context)
          } catch (cause) {
            throw new Error(`Failed to process resource '${resource.type}:${resource.logicalId}': ${cause}`, { cause })
          }
        }
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
        case 'exit':
          // falls through
        default: {
          this.log('Exiting without making any changes.')
          this.exit(0)
        }
      }
    }
  }
}
