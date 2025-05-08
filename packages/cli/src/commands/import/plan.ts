import fs from 'node:fs/promises'
import { Args, Flags, ux } from '@oclif/core'
import prompts from 'prompts'
import chalk from 'chalk'
import { isAxiosError } from 'axios'
import logSymbols from 'log-symbols'
import { validate as validateUuid } from 'uuid'

import * as api from '../../rest/api'
import { AuthCommand } from '../authCommand'
import commonMessages from '../../messages/common-messages'
import { splitConfigFilePath } from '../../services/util'
import { ChecklyConfig, loadChecklyConfig } from '../../services/checkly-config-loader'
import { ImportPlan, ProjectNotFoundError, ImportPlanFilter, ImportPlanOptions } from '../../rest/projects'
import { Comment, docComment, Program } from '../../sourcegen'
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
      default: '__checks__',
    }),
    preview: Flags.boolean({
      description: 'Preview generated code without creating an actual import plan.',
      default: false,
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

  static args = {
    resource: Args.string({
      name: 'resource',
      required: false,
      description: 'A specific resource to import.',
    }),
  }

  static strict = false

  async run (): Promise<void> {
    const { flags, argv } = await this.parse(ImportPlanCommand)
    const {
      config: configFilename,
      root: rootDirectory,
      'debug-import-plan': debugImportPlan,
      'debug-import-plan-output-file': debugImportPlanOutputFile,
      preview,
    } = flags

    const filters = argv.map(value => {
      return parseFilter(value as string)
    })

    // Inject the default filter.
    //
    // By default all resource will be included, unless the user has specified
    // an inclusive filter by themselves, in which case the default filter
    // excludes all resources.
    filters.unshift({
      type: filters.some(({ type }) => type === 'include') ? 'exclude' : 'include',
    })

    const { configDirectory, configFilenames } = splitConfigFilePath(configFilename)
    const {
      config: checklyConfig,
    } = await loadChecklyConfig(configDirectory, configFilenames)

    await this.#initializeProject(checklyConfig)

    const {
      logicalId,
    } = checklyConfig

    if (!preview) {
      const { data: existingPlans } = await api.projects.findImportPlans(logicalId, {
        onlyUncommitted: true,
      })

      if (existingPlans.length !== 0) {
        await this.#handleExistingPlans(existingPlans)
      }
    }

    const plan = await this.#createImportPlan(logicalId, {
      preview,
      filters,
    })
    if (!plan) {
      return
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
        constructHeaders: preview ? [previewComment()] : undefined,
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

  async #createImportPlan (logicalId: string, options: ImportPlanOptions): Promise<ImportPlan | undefined> {
    if (this.fancy) {
      ux.action.start('Creating a new plan', undefined, { stdout: true })
    }

    try {
      const { data } = await api.projects.createImportPlan(logicalId, options)

      if (this.fancy) {
        ux.action.stop('✅ ')
      }

      return data
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
              localSnippetFile.header(docComment(
                `This file has been generated to help resolve cross-snippet imports.\n` +
                `\n` +
                `We recommend rewriting your imports to not reference this file, after which\n` +
                `you may remove it.`,
              ))
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

  async #initializeProject (config: ChecklyConfig): Promise<void> {
    const {
      logicalId,
      projectName,
      repoUrl,
    } = config

    if (this.fancy) {
      ux.action.start('Checking project status', undefined, { stdout: true })
    }

    try {
      await api.projects.get(logicalId)

      if (this.fancy) {
        ux.action.stop('✅ ')
      }

      // The project has already been initialized, not need to do anything.
      return
    } catch (err) {
      if (err instanceof ProjectNotFoundError) {
        if (this.fancy) {
          ux.action.stop('❌ Uninitialized project')
        }

        // The project does not exist yet and we must create (initialize) it.
      } else {
        if (this.fancy) {
          ux.action.stop('❌')
        }

        throw err
      }
    }

    const choices: prompts.Choice[] = [{
      title: `Yes, I want to start a new project with the imported resources`,
      value: 'init',
    }, {
      title: `No, I intended to import resources into an existing project`,
      value: 'mistake',
      description: 'Exit and verify your configuration.',
    }, {
      title: 'No, I want to cancel and exit',
      value: 'exit',
      description: 'No changes will be made.',
    }]

    const { action } = await prompts({
      name: 'action',
      type: 'select',
      message: 'Your project has not been initialized yet. Initialize now?',
      choices,
    })

    switch (action) {
      case 'init': {
        try {
          if (this.fancy) {
            ux.action.start('Initializing project', undefined, { stdout: true })
          }

          await api.projects.create({
            name: projectName,
            logicalId,
            repoUrl,
          })

          if (this.fancy) {
            ux.action.stop('✅ ')
          }
        } catch (err) {
          if (this.fancy) {
            ux.action.stop('❌')
          }

          throw err
        }

        break
      }
      case 'mistake':
        this.log(chalk.red('Please verify your configuration and try again.'))
        this.log('Exiting without making any changes.')
        this.exit(0)
        break
      case 'exit':
        // falls through
      default: {
        this.log('Exiting without making any changes.')
        this.exit(0)
      }
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

function previewComment(): Comment {
  return docComment(
    'This Checkly construct file has been generated for preview purposes only.' +
    '\n\n' +
    'Deploying this file will create duplicate resources.',
  )
}

class InvalidResourceIdentifierError extends Error {}

function parseFilter (spec: string): ImportPlanFilter {
  const filter: ImportPlanFilter = {
    type: 'include'
  }

  if (spec.startsWith('!')) {
    filter.type = 'exclude'
    spec = spec.slice(1)
  }

  const [type, physicalId] = spec.split(':', 2)

  const integerPhysicalId = (value: string | undefined): number | undefined => {
    if (value === undefined) {
      return
    }

    if (value === '' || value === '*') {
      return
    }

    const numberValue = parseInt(value, 10)
    if (Number.isNaN(numberValue)) {
      throw new InvalidResourceIdentifierError(`Resource identifier '${value}' must be a valid integer`)
    }

    return numberValue
  }

  const uuidPhysicalId = (value: string | undefined): string | undefined => {
    if (value === undefined) {
      return
    }

    if (value === '' || value === '*') {
      return
    }

    if (!validateUuid(value)) {
      throw new InvalidResourceIdentifierError(`Resource identifier '${value}' must be a valid UUID`)
    }

    return value
  }

  const mappings = {
    'alert-channel': integerPhysicalId,
    'check-group': integerPhysicalId,
    'check': uuidPhysicalId,
    'dashboard': integerPhysicalId,
    'maintenance-window': integerPhysicalId,
    'private-location': uuidPhysicalId,
    'status-page-service': uuidPhysicalId,
    'status-page': uuidPhysicalId,
  }

  const parseId = mappings[type as keyof typeof mappings]
  if (parseId === undefined) {
    throw new Error(`Invalid resource specifier '${spec}': Unsupported resource type '${type}'`)
  }

  try {
    filter.resource = {
      type,
      physicalId: parseId(physicalId),
    }
  } catch (err) {
    if (err instanceof InvalidResourceIdentifierError) {
      throw new Error(`Invalid resource specifier '${spec}': ${err.message}`)
    }

    throw err
  }

  return filter
}
