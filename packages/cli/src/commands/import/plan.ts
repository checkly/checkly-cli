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
import { ChecklyConfig, ConfigNotFoundError, loadChecklyConfig } from '../../services/checkly-config-loader'
import { ImportPlan, ProjectNotFoundError, ImportPlanFilter, ImportPlanOptions, ResourceSync } from '../../rest/projects'
import { cased, Comment, docComment, Program } from '../../sourcegen'
import { ConstructCodegen, sortResources } from '../../constructs/construct-codegen'
import { Context } from '../../constructs/internal/codegen'
import {
  isSnippet,
  isSafeSnippetFilename,
} from '../../constructs/internal/codegen/snippet'
import { StaticAuxiliaryFile } from '../../sourcegen/program'
import { ExitError } from '@oclif/core/errors'
import { confirmCommit, performCommitAction } from './commit'
import { confirmApply, performApplyAction } from './apply'
import { generateChecklyConfig } from '../../services/checkly-config-codegen'
import { wrap } from '../../helpers/wrap'
import { PackageFilesResolver } from '../../services/check-parser/package-files/resolver'
import { PackageJsonFile } from '../../services/check-parser/package-files/package-json-file'

export default class ImportPlanCommand extends AuthCommand {
  static hidden = false
  static description = `\
Import existing resources from your Checkly account to your project.

By default, all resources that can be imported will be imported. However, you
may fine-tune the process by including or excluding any combination of
resources.

The import process consists of three steps:

1. Creating a plan, which generates the appropriate code for your resources
2. Applying the plan, which links your resources to the generated code
3. Committing the plan, which finalizes the import session

CREATING A PLAN

Creating a plan carries no risk as no concrete links to your Checkly resources
are made at this point. However, if you accidentally deploy the generated code
before applying the plan, you will end up with duplicate resources and will
not be able to complete the import session without first deleting the
duplicates.

For the curious, you may also preview the generated code with the '--preview'
option. No plan will be created, allowing you to leisurely inspect the
generated code. However keep in mind that you will need to create a plan to
actually import any resources, at which point the code will be generated
again.

You may cancel any plan you've created without affecting any of the
underlying resources.

APPLYING A PLAN

Applying a plan links your existing resources to the generated code. You
should carefully review the generated code to make sure that it contains the
resources you expect before applying a plan. After a plan has been applied,
any deployments of those resources will irreversibly modify the underlying
Checkly resources. However, as a fail safe against concurrent use, any
deployments not including the imported resources will not delete the
underlying resources (or the links to the resources). This means that there
is no need to block deployments while working on an import session.

Even after you've applied a plan, you may still cancel it, which will unlink
the underlying resources from your project once more. However, keep in mind
that any changes to the resources that you've already deployed cannot be
undone.

COMMITTING A PLAN

Finally, committing a plan removes all fail safes and permanently links the
imported resources to your project. Any resources you remove from your code
will result in the underlying resources also getting irrevocably deleted on
the next deploy. You should only commit your plan once you are sure that all
future deployments include the imported resources.`

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

  static hiddenAliases = [
    'import',
  ]

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

    this.log(`${logSymbols.info} You are about to import resources from your Checkly account.`)
    this.log()
    this.#outputComment(
      `Please make sure to commit any unsaved changes to avoid having any ` +
      `local changes get overwritten by generated code.`,
    )

    const program = new Program({
      rootDirectory,
      constructFileSuffix: '.check',
      constructHeaders: preview ? [previewComment()] : undefined,
      specFileSuffix: '.spec',
      language: 'typescript',
    })

    const checklyConfig = await this.#loadConfig(configFilename)
      ?? await this.#interactiveCreateConfig()

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

    const codegen = new ConstructCodegen(program)

    // If the user provided no filter, ask interactively.
    if (filters.length === 0) {
      filters.push(...await this.#interactiveFilter(logicalId, codegen))
    }

    // Inject the default filter.
    //
    // By default all resource will be included, unless the user has specified
    // an inclusive filter by themselves, in which case the default filter
    // excludes all resources.
    filters.unshift({
      type: filters.some(({ type }) => type === 'include') ? 'exclude' : 'include',
    })

    while (true) {
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
        const { failures } = this.#generateCode(plan, program, codegen)
        if (failures.length) {
          this.log(`${logSymbols.error} ${chalk.red('The following resources could not be imported:')}`)
          this.log()

          for (const { resource, cause } of failures) {
            const spec = `${resource.type}:${resource.physicalId}`
            const desc = (() => {
              try {
                return codegen.describe(resource as any)
              } catch {
                return resource.type
              }
            })()

            this.log(`  ${desc} (${chalk.gray(spec)})`)
            this.log()
            this.log(`    ${chalk.red(cause.toString())}`)
            this.log()

            // Proactively exclude the failed resource. If the user wants to
            // retry it'll already be in the filter list, and otherwise it will
            // simply not get used.
            filters.push({
              type: 'exclude',
              resource: {
                type: resource.type,
                physicalId: resource.physicalId,
              },
            })
          }

          const retry = await this.#confirmRetryWithoutFailed()
          if (!retry) {
            this.cancelAndExit()
          }

          // When previewing, there is no plan to cancel.
          if (preview) {
            continue
          }

          this.log(`${logSymbols.info} The current plan will be cancelled so that a new plan can be created.`)

          if (this.fancy) {
            ux.action.start('Cancelling current plan', undefined, { stdout: true })
          }

          try {
            await api.projects.cancelImportPlan(plan.id)

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

          this.log(`${logSymbols.info} A new plan will be created without the failed resources.`)

          continue
        }

        if (this.fancy) {
          ux.action.start('Writing files', undefined, { stdout: true })
        }

        try {
          await program.realize()

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

        this.log(`${logSymbols.success} ${chalk.bold('Your import plan has been created!')}`)
        this.log()
        this.log(`  You can find the generated code under the following directory:`)
        this.log()
        this.log(`    ${chalk.green(rootDirectory)}`)
        this.log()
        this.log(`\
  The imported resources have not been linked to your project yet. Please
  make sure to inspect the generated code. Should you find anything you do
  not like, you can cancel the import plan and no harm will be done.

  ${logSymbols.warning} \
${chalk.yellow('If you deploy now, you will end up with duplicate resources!')}

  Once you have inspected the code, the next step will be to apply the plan,
  which links the generated code to the underlying resources, making them
  modifiable. At this point you may still cancel the plan, though any changes
  you've already deployed cannot be undone.

  ${logSymbols.info} \
${chalk.cyan('For safety, resources are not deletable until the plan has been committed.')}

  The final step will be to commit your plan, at which point the underlying
  resources will be fully managed by the Checkly CLI in the exact same
  manner as any other CLI-native resource.
`)

        const apply = await confirmApply.call(this)
        if (!apply) {
          return
        }

        await performApplyAction.call(this, plan)

        const commit = await confirmCommit.call(this)
        if (!commit) {
          return
        }

        await performCommitAction.call(this, plan)

        return
      } catch (err) {
        if (err instanceof ExitError) {
          throw err
        }

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
  }

  #outputComment (comment: string) {
    this.log(chalk.cyan(wrap(comment, { prefix: '// ' })))
    this.log()
  }

  #outputConfigSection (options: {
    title: string,
    step: [number, number],
    description: string,
  }) {
    const { title, step: [step, totalSteps], description } = options
    this.log(`  ${title} ${chalk.grey(`(step ${step}/${totalSteps})`)}`)
    this.log()
    this.#outputComment(description)
  }

  async #askProjectName (step: [number, number]): Promise<string> {
    this.#outputConfigSection({
      title: `Let's give your project a name`,
      description: `You'll be able to change the name later if you like.`,
      step,
    })

    while (true) {
      const { projectName } = await prompts({
        name: 'projectName',
        type: 'text',
        message: 'What should we call your project?',
      })
      this.log()

      if (projectName === undefined) {
        this.cancelAndExit()
      }

      if (projectName.trim() !== '') {
        return projectName
      }

      this.#outputComment(
        `Sorry, but a project name is absolutely required. ` +
        `You can also press ESC to cancel and exit.`,
      )
    }
  }

  async #askLogicalId (suggested: string, step: [number, number]): Promise<string> {
    this.#outputConfigSection({
      title: `Set up a unique project identifier`,
      description: `The identifier given here uniquely identifies your ` +
        `project among any other Checkly projects you may have. You will ` +
        `not be able to change the identifier later without recreating the ` +
        `project. Please choose a value you'll be comfortable with ` +
        `long term.`,
      step,
    })

    while (true) {
      const { logicalId } = await prompts({
        name: 'logicalId',
        type: 'text',
        message: 'How would you like your project to be identified?',
        initial: suggested,
        validate: (input) => {
          if (!/^[A-Za-z0-9_\-/#.]+$/.test(input)) {
            return `Please only use ASCII letters, numbers, and the ` +
              `symbols _, -, /, #, and .`
          }

          return true
        },
      })
      this.log()

      if (logicalId === undefined) {
        this.cancelAndExit()
      }

      if (logicalId.trim() !== '') {
        return logicalId
      }

      this.#outputComment(
        `Sorry, but a project identifier is absolutely required. ` +
        `You can also press ESC to cancel and exit.`,
      )
    }
  }

  async #interactiveCreateConfig (): Promise<ChecklyConfig> {
    this.log(`${logSymbols.warning} ${chalk.yellow(`Unable to find an existing Checkly configuration file.`)}`)
    this.log()
    this.#outputComment(
      `Setting up Checkly for the first time? No worries, we'll walk you ` +
      `through the process.`,
    )

    const choices: prompts.Choice[] = [{
      title: `Yes, I want to start a new project for the imported resources`,
      value: 'init',
      description: `We'll walk you through a minimal setup`,
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
      message: 'Set up a new Checkly project?',
      choices,
    })
    this.log()

    switch (action) {
      case 'init': {
        const projectName = await this.#askProjectName([1, 2])
        const suggestedLogicalId = cased(projectName, 'kebab-case')
        const logicalId = await this.#askLogicalId(suggestedLogicalId, [2, 2])

        try {
          if (this.fancy) {
            ux.action.start('Creating project', undefined, { stdout: true })
          }

          try {
            await api.projects.create({
              name: projectName,
              logicalId,
            })
          } catch (err) {
            if (isAxiosError(err)) {
              if (err.response?.status === 409) {
                throw new Error(`You are already using the same identifier for a different project.`)
              }
            }

            throw err
          }

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

        const program = new Program({
          rootDirectory: '.',
          constructFileSuffix: '.check',
          specFileSuffix: '.spec',
          language: 'typescript',
        })

        const context = new Context()

        const config: ChecklyConfig = {
          projectName,
          logicalId,
          checks: {
            checkMatch: '**/__checks__/**/*.check.ts',
          },
        }

        try {
          if (this.fancy) {
            ux.action.start('Creating Checkly configuration', undefined, { stdout: true })
          }

          // TODO: Make this less ugly.
          generateChecklyConfig(program, context, config, 'checkly.config.ts')

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

        try {
          if (this.fancy) {
            ux.action.start('Configuring package.json for Checkly', undefined, { stdout: true })
          }

          // TODO: Make this less ugly.
          const packageJson = (() => {
            const file = this.#loadPackageJson()
            if (file !== undefined) {
              this.log(`${logSymbols.success} Found existing package.json`)
              return file
            } else {
              this.log(`${logSymbols.success} Creating a new minimal package.json`)
              return this.#createPackageJson(logicalId)
            }
          })()

          const updated = packageJson.upsertDevDependencies({
            checkly: `^5`,
            jiti: '^2',
          })

          if (updated) {
            this.log(`${logSymbols.success} Successfully added Checkly devDependencies`)
            program.staticSupportFile(packageJson.meta.filePath, packageJson.toJSON())
          } else {
            this.log(`${logSymbols.success} Checkly devDependencies are already up to date`)
          }

          this.log()

          if (this.fancy) {
            ux.action.stop('✅ ')
            this.log()
          }

          if (updated) {
            this.#outputComment(
              `Please make sure to run the appropriate install command for ` +
              `your package manager once you're done with the setup.`,
            )
          }
        } catch (err) {
          if (this.fancy) {
            ux.action.stop('❌')
            this.log()
          }

          throw err
        }

        try {
          if (this.fancy) {
            ux.action.start('Writing project files', undefined, { stdout: true })
          }

          await program.realize()

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

        return config
      }
      case 'mistake':
        this.log(chalk.red('Please verify your configuration and try again.'))
        this.log()
        this.cancelAndExit()
        break
      case 'exit':
        // falls through
      default: {
        this.cancelAndExit()
      }
    }
  }

  #loadPackageJson (): PackageJsonFile | undefined {
    const resolver = new PackageFilesResolver()
    return resolver.loadPackageJsonFile(process.cwd(), {
      isDir: true,
    })
  }

  #createPackageJson (logicalId: string): PackageJsonFile {
    return PackageJsonFile.make(PackageJsonFile.FILENAME, {
      name: logicalId,
      version: '1.0.0',
      private: true,
    })
  }

  async #loadConfig (configFile?: string): Promise<ChecklyConfig | undefined> {
    const { configDirectory, configFilenames } = splitConfigFilePath(configFile)

    try {
      const {
        config: checklyConfig,
      } = await loadChecklyConfig(configDirectory, configFilenames)

      return checklyConfig
    } catch (err) {
      if (err instanceof ConfigNotFoundError) {
        return
      }

      throw err
    }
  }

  async #confirmRetryWithoutFailed (): Promise<boolean> {
    const { action } = await prompts({
      name: 'action',
      type: 'confirm',
      message: 'Would you like to try again without the failed resources?',
    })

    return action ?? false
  }

  async #createImportPlan (logicalId: string, options: ImportPlanOptions): Promise<ImportPlan | undefined> {
    if (this.fancy) {
      ux.action.start('Creating a new plan', undefined, { stdout: true })
    }

    try {
      const { data } = await api.projects.createImportPlan(logicalId, options)

      if (this.fancy) {
        ux.action.stop('✅ ')
        this.log()
      }

      return data
    } catch (err) {
      if (this.fancy) {
        ux.action.stop('❌')
        this.log()
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

  async #interactiveFilter (logicalId: string, codegen: ConstructCodegen): Promise<ImportPlanFilter[]> {
    const choices: prompts.Choice[] = [{
      title: `I want to import everything in one go`,
      value: 'all',
    }, {
      title: `Let me choose resources manually`,
      value: 'choose',
      description: 'You will be presented with options.'
    }, {
      title: 'Cancel and exit',
      value: 'exit',
      description: 'No changes will be made.',
    }]

    const { action } = await prompts({
      name: 'action',
      type: 'select',
      message: 'Which resources would you like to import?',
      choices,
    })

    switch (action) {
      case 'all':
        return []
      case 'choose': {
        const choices: prompts.Choice[] = await (async () => {
          if (this.fancy) {
            ux.action.start('Fetching available resources', undefined, { stdout: true })
          }

          try {
            const { data } = await api.projects.createImportPlan(logicalId, {
              preview: true,
              filters: [{
                type: 'include',
              }],
            })

            if (this.fancy) {
              ux.action.stop('✅ ')
              this.log()
            }

            return (data.changes?.resources ?? []).flatMap(resource => {
              if (!isFilterable(resource.type)) {
                return []
              }

              try {
                return [{
                  title: codegen.describe(resource as any),
                  value: `${resource.type}:${resource.physicalId}`,
                  description: `${resource.type}:${resource.physicalId}`,
                }]
              } catch {
                return []
              }
            })
          } catch (err) {
            if (this.fancy) {
              ux.action.stop('❌')
              this.log()
            }

            if (isAxiosError(err)) {
              if (err.response?.status === 404) {
                return []
              }
            }

            throw err
          }
        })()

        choices.sort((a, b) => {
          return a.title.localeCompare(b.title)
        })

        const { resources } = await prompts({
          name: 'resources',
          type: 'autocompleteMultiselect',
          message: 'Please select the resources you would like to import',
          choices,
          hint: ' - Space to select. Return to submit.',
          instructions: false,
        })

        if (resources === undefined) {
          this.cancelAndExit()
        }

        if (resources.length === 0) {
          this.log(chalk.red('You did not choose any resources.'))
          this.log()
          this.cancelAndExit()
        }

        return resources.map(parseFilter)
      }
      case 'exit':
        // falls through
      default: {
        this.cancelAndExit()
      }
    }
  }

  #generateCode (plan: ImportPlan, program: Program, codegen: ConstructCodegen): GenerateCodeResult {
    if (this.fancy) {
      ux.action.start('Generating Checkly constructs for imported resources', undefined, { stdout: true })
    }

    try {
      const context = new Context()

      const failures = new Map<string, FailedResource>()

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
            if (!(cause instanceof Error)) {
              throw cause
            }

            failures.set(resource.logicalId, {
              resource,
              cause,
            })
          }
        }

        for (const resource of resources) {
          if (failures.has(resource.logicalId)) {
            continue
          }

          try {
            codegen.gencode(resource.logicalId, resource as any, context)
          } catch (cause) {
            if (!(cause instanceof Error)) {
              throw cause
            }

            failures.set(resource.logicalId, {
              resource,
              cause,
            })
          }
        }
      }

      if (this.fancy) {
        if (failures.size === 0) {
          ux.action.stop('✅ ')
          this.log()
        } else {
          ux.action.stop('❌')
          this.log()
        }
      }

      return {
        failures: [...failures.values()],
      }
    } catch (err) {
      if (this.fancy) {
        ux.action.stop('❌')
        this.log()
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
        this.log()
      }

      // The project has already been initialized, not need to do anything.
      return
    } catch (err) {
      if (err instanceof ProjectNotFoundError) {
        if (this.fancy) {
          ux.action.stop('❌ Uninitialized project')
          this.log()
        }

        // The project does not exist yet and we must create (initialize) it.
      } else {
        if (this.fancy) {
          ux.action.stop('❌')
          this.log()
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
            this.log()
          }
        } catch (err) {
          if (this.fancy) {
            ux.action.stop('❌')
            this.log()
          }

          throw err
        }

        break
      }
      case 'mistake':
        this.log(chalk.red('Please verify your configuration and try again.'))
        this.log()
        this.cancelAndExit()
        break
      case 'exit':
        // falls through
      default: {
        this.cancelAndExit()
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
            this.cancelAndExit()
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
              this.log()
            }
          } catch (err) {
            if (this.fancy) {
              ux.action.stop('❌')
              this.log()
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
          this.cancelAndExit()
        }
      }
    }
  }

  cancelAndExit (): never {
    this.log('Exiting without making any changes.')
    this.exit(0)
  }
}

interface FailedResource {
  resource: ResourceSync
  cause: Error
}

interface GenerateCodeResult {
  failures: FailedResource[]
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

  const parseId = importables[type as keyof typeof importables]
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

function integerPhysicalId (value: string | undefined): number | undefined {
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

function uuidPhysicalId (value: string | undefined): string | undefined {
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

const importables = {
  'alert-channel': integerPhysicalId,
  'check-group': integerPhysicalId,
  'check': uuidPhysicalId,
  'dashboard': integerPhysicalId,
  'maintenance-window': integerPhysicalId,
  'private-location': uuidPhysicalId,
  'status-page-service': uuidPhysicalId,
  'status-page': uuidPhysicalId,
}

function isFilterable (type: string): boolean {
  return importables[type as keyof typeof importables] !== undefined
}
