import fs from 'node:fs/promises'
import path from 'node:path'
import { setTimeout } from 'node:timers/promises'

import { Args, Flags } from '@oclif/core'
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
import { ImportPlan, ProjectNotFoundError, ImportPlanFilter, ImportPlanOptions, ResourceSync, ImportPlanFriend, FriendResourceSync } from '../../rest/projects'
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
import { PackageFilesResolver } from '../../services/check-parser/package-files/resolver'
import { PackageJsonFile } from '../../services/check-parser/package-files/package-json-file'
import { detectPackageManager, knownPackageManagers, PackageManager } from '../../services/check-parser/package-files/package-manager'
import { parseProject } from '../../services/project-parser'
import { Runtime } from '../../rest/runtimes'
import { ConstructExport, Project, Session } from '../../constructs/project'
import { Diagnostics } from '../../constructs'

type FriendExports = {
  [type in FriendResourceSync['type']]: Map<string, ConstructExport>
}

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
    'config': Flags.string({
      char: 'c',
      description: commonMessages.configFile,
    }),
    'root': Flags.string({
      description: 'The root folder in which to write generated code files.',
      default: '__checks__',
    }),
    'preview': Flags.boolean({
      description: 'Preview generated code without creating an actual import plan.',
      default: false,
    }),
    'debug-import-plan': Flags.boolean({
      description: 'Output the import plan to a file.',
      default: false,
      hidden: true,
    }),
    'debug-import-plan-input-file': Flags.string({
      description: 'A file to load an import plan from.',
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
      'debug-import-plan-input-file': debugImportPlanInputFile,
      'debug-import-plan-output-file': debugImportPlanOutputFile,
      preview,
    } = flags

    const filters = argv.map(value => {
      return parseFilter(value as string)
    })

    const createProgram = () => {
      return new Program({
        rootDirectory,
        constructFileSuffix: '.check',
        constructHeaders: preview ? [previewComment()] : undefined,
        specFileSuffix: '.spec',
        language: 'typescript',
      })
    }

    const friendExports: FriendExports = {
      'alert-channel': new Map(),
      'check-group': new Map(),
      'private-location': new Map(),
      'status-page-service': new Map(),
    }

    if (debugImportPlanInputFile) {
      const plan = await (async () => {
        this.style.actionStart('Loading debug import plan')

        try {
          const input = await fs.readFile(debugImportPlanInputFile, {
            encoding: 'utf8',
          })

          const plan = JSON.parse(input)

          this.style.actionSuccess()

          return plan
        } catch (err) {
          this.style.actionFailure()

          throw err
        }
      })()

      this.style.shortSuccess(
        `Successfully loaded debug import plan from "${debugImportPlanInputFile}".`,
      )

      const program = createProgram()
      const codegen = new ConstructCodegen(program)

      const { failures } = this.#generateCode(plan, program, codegen, friendExports)
      if (failures.length) {
        this.#outputFailures(failures, codegen)
        this.style.shortError(`Unable to continue due to failed resources.`)
        this.exit(1)
      }

      this.style.actionStart('Writing files')

      try {
        await program.realize()

        this.style.actionSuccess()
      } catch (err) {
        this.style.actionFailure()

        throw err
      }

      this.style.longSuccess(
        `Debug import plan has been created!`,
        `You can find the generated code under the following directory:`
        + `\n\n`
        + `  ${chalk.green(rootDirectory)}`,
      )

      return
    }

    this.style.shortInfo(
      `You are about to import resources from your Checkly account.`,
    )
    this.style.comment(
      `Please make sure to commit any unsaved changes to avoid having any `
      + `local changes get overwritten by generated code.`,
    )

    const { configDirectory, configFilenames } = splitConfigFilePath(configFilename)

    const checklyConfig = await this.#loadConfig(configDirectory, configFilenames)
      ?? await this.#interactiveCreateConfig(configDirectory)

    await this.#initializeProject(checklyConfig)

    const constructExports = await this.#findExportedResources(
      configDirectory,
      checklyConfig,
      rootDirectory,
    )

    const friends: ImportPlanFriend[] = []
    for (const constructExport of constructExports) {
      const { type, logicalId } = constructExport

      const friendExport = friendExports[type as keyof typeof friendExports]
      if (friendExport === undefined) {
        continue
      }

      friendExport.set(logicalId, constructExport)

      friends.push({
        type,
        logicalId,
      })
    }

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

    // These are needed for the interactive filter creation for now. Ideally
    // we'd remove these.
    const program = createProgram()
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
      // Recreate program on every attempt as otherwise resources from earlier
      // runs will persist.
      const program = createProgram()
      const codegen = new ConstructCodegen(program)

      const plan = await this.#createImportPlan(logicalId, {
        preview,
        filters,
        friends,
      })
      if (!plan) {
        return
      }

      if (debugImportPlan) {
        const output = JSON.stringify(plan, null, 2)
        await fs.writeFile(debugImportPlanOutputFile, output, 'utf8')
        this.style.shortSuccess(
          `Successfully wrote debug import plan to "${debugImportPlanOutputFile}".`,
        )
        return
      }

      try {
        const { failures } = this.#generateCode(plan, program, codegen, friendExports)
        if (failures.length) {
          const excludeFailed = this.#outputFailures(failures, codegen)

          // Proactively exclude failed resources. If the user wants to
          // retry they'll already be in the filter list, and otherwise the
          // filters will simply not get used.
          filters.push(...excludeFailed)

          const retry = await this.#confirmRetryWithoutFailed()
          if (!retry) {
            this.cancelAndExit()
          }

          // When previewing, there is no plan to cancel.
          if (preview) {
            continue
          }

          this.style.comment(
            `The current plan will be cancelled so that a new plan can be created.`,
          )

          this.style.actionStart('Cancelling current plan')

          try {
            await api.projects.cancelImportPlan(plan.id)

            this.style.actionSuccess()
          } catch (err) {
            this.style.actionFailure()

            throw err
          }

          this.style.comment(`A new plan will be created without the failed resources.`)

          continue
        }

        this.style.actionStart('Writing files')

        try {
          await program.realize()

          this.style.actionSuccess()
        } catch (err) {
          this.style.actionFailure()

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

  #outputFailures (failures: FailedResource[], codegen: ConstructCodegen): ImportPlanFilter[] {
    const filters: ImportPlanFilter[] = []

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

      filters.push({
        type: 'exclude',
        resource: {
          type: resource.type,
          physicalId: resource.physicalId,
        },
      })
    }

    return filters
  }

  #outputConfigSection (options: {
    title: string
    step: [number, number]
    description: string
  }) {
    const { title, step: [step, totalSteps], description } = options
    this.log(`  ${title} ${chalk.grey(`(step ${step}/${totalSteps})`)}`)
    this.log()
    this.style.comment(description)
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

      this.style.comment(
        `Sorry, but a project name is absolutely required. `
        + `You can also press ESC to cancel and exit.`,
      )
    }
  }

  async #askLogicalId (suggested: string, step: [number, number]): Promise<string> {
    this.#outputConfigSection({
      title: `Set up a unique project identifier`,
      description: `The identifier given here uniquely identifies your `
        + `project among any other Checkly projects you may have. You will `
        + `not be able to change the identifier later without recreating the `
        + `project. Please choose a value you'll be comfortable with `
        + `long term.`,
      step,
    })

    while (true) {
      const { logicalId } = await prompts({
        name: 'logicalId',
        type: 'text',
        message: 'How would you like your project to be identified?',
        initial: suggested,
        validate: input => {
          if (!/^[A-Za-z0-9_\-/#.]+$/.test(input)) {
            return `Please only use ASCII letters, numbers, and the `
              + `symbols _, -, /, #, and .`
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

      this.style.comment(
        `Sorry, but a project identifier is absolutely required. `
        + `You can also press ESC to cancel and exit.`,
      )
    }
  }

  async #interactiveCreateConfig (configDirectory: string): Promise<ChecklyConfig> {
    this.style.shortWarning(`Unable to find an existing Checkly configuration file.`)
    this.style.comment(
      `Setting up Checkly for the first time? No worries, we'll walk you `
      + `through the process.`,
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
          this.style.actionStart('Creating project')

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

          this.style.actionSuccess()
        } catch (err) {
          this.style.actionFailure()

          throw err
        }

        const program = new Program({
          rootDirectory: configDirectory,
          constructFileSuffix: '.check',
          specFileSuffix: '.spec',
          language: 'typescript',
        })

        const context = new Context()

        const config: ChecklyConfig = {
          projectName,
          logicalId,
          checks: {
            tags: ['mac'],
            checkMatch: '**/__checks__/**/*.check.ts',
          },
        }

        try {
          this.style.actionStart('Creating Checkly configuration')

          // TODO: Make this less ugly.
          generateChecklyConfig(program, context, config, 'checkly.config.ts')

          this.style.actionSuccess()
        } catch (err) {
          this.style.actionFailure()

          throw err
        }

        let askInstall = false
        let packageJson: PackageJsonFile

        try {
          this.style.actionStart('Configuring package.json for Checkly')

          // TODO: Make this less ugly.
          packageJson = await (async () => {
            const file = await this.#loadPackageJson()
            if (file !== undefined) {
              this.style.shortSuccess(`Found existing package.json`)
              return file
            } else {
              this.style.shortSuccess(`Creating a new minimal package.json`)
              return this.#createPackageJson(logicalId)
            }
          })()

          const ownPackageJson = await this.loadPackageJsonOfSelf()

          const updated = packageJson.upsertDevDependencies({
            checkly: `^${ownPackageJson?.version ?? '6'}`,
            jiti: '^2',
          })

          if (updated) {
            this.style.shortSuccess(`Successfully added Checkly devDependencies`)
            program.staticSupportFile(packageJson.meta.filePath, packageJson.toJSON())
            askInstall = true
          } else {
            this.style.shortSuccess(`Checkly devDependencies are already up to date`)
          }

          this.style.actionSuccess()
        } catch (err) {
          this.style.actionFailure()

          throw err
        }

        try {
          this.style.actionStart('Writing project files')

          await program.realize()

          this.style.actionSuccess()
        } catch (err) {
          this.style.actionFailure()

          throw err
        }

        if (askInstall && packageJson !== undefined) {
          await this.#interactiveNpmInstall(packageJson.meta.dirname)
        }

        return config
      }
      case 'mistake':
        this.style.fatal(`Please verify your configuration and try again.`)
        this.cancelAndExit()
        break
      case 'exit':
        // falls through
      default: {
        this.cancelAndExit()
      }
    }
  }

  async #loadPackageJson (): Promise<PackageJsonFile | undefined> {
    const resolver = new PackageFilesResolver()
    return await resolver.loadPackageJsonFile(process.cwd(), {
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

  async #interactiveNpmInstall (dirPath: string, forcePackageManager?: PackageManager): Promise<void> {
    const { execa } = await import('execa')

    const packageManager = forcePackageManager ?? await (async () => {
      try {
        this.style.actionStart(`Detecting package manager`)

        const packageManager = await detectPackageManager(dirPath)

        this.style.actionSuccess()

        this.style.comment(
          `It looks like your package manager is ${packageManager.name}.`,
        )

        return packageManager
      } catch (err) {
        this.style.actionFailure()

        throw err
      }
    })()

    const { unsafeDisplayCommand, executable, args } = packageManager.installCommand()

    const choices: prompts.Choice[] = [{
      title: `Yes, please run \`${unsafeDisplayCommand}\` for me`,
      value: 'install',
    }, {
      title: `I want to use a different package manager`,
      value: 'other-manager',
    }, {
      title: 'I will do it later myself',
      value: 'later',
    }]

    const { action } = await prompts({
      type: 'select',
      name: 'action',
      message: 'Would you like to install dependencies now? (recommended)',
      choices,
    })
    this.log()

    switch (action) {
      case 'install': {
        this.style.comment(
          `Ok, now running \`${unsafeDisplayCommand}\`.`,
        )

        try {
          await execa(executable, args, {
            cwd: dirPath,
            stdout: ['inherit'],
            stderr: ['inherit'],
            stdin: ['inherit'],
          })

          this.log()

          this.style.comment(
            `Successfully installed dependencies.`,
          )
        } catch (err) {
          if (err instanceof Error) {
            this.style.longError(`Failed to install dependencies`, err.message) // TODO :
          }

          this.style.comment(
            `Uh oh. Looks like that didn't quite work as expected.`
            + `\n\n`
            + `You can still continue the import process and install `
            + `dependencies later by yourself.`,
          )

          const { action } = await prompts({
            type: 'confirm',
            name: 'action',
            message: 'Continue the import process?',
          })
          this.log()

          if (action) {
            this.style.comment(
              `Great, let's proceed to the next step.`,
            )
            await setTimeout(200)
          } else {
            this.cancelAndExit()
          }
        }

        break
      }
      case 'other-manager': {
        const packageManagersByName = Object.fromEntries(
          knownPackageManagers.map(packageManager => {
            return [packageManager.name, packageManager]
          }),
        )

        const choices = knownPackageManagers.map(packageManager => ({
          title: packageManager.name,
          value: packageManager.name,
        }))

        choices.push({
          title: 'None of the above',
          value: 'other',
        })

        const { action } = await prompts({
          type: 'select',
          name: 'action',
          message: 'Which package manager would you like to use?',
          choices,
        })
        this.log()

        if (action === undefined) {
          this.cancelAndExit()
        }

        if (action === 'other') {
          this.style.comment(
            `Alright. If possible, let us know which package manager you `
            + `use and we may be able to support it in the future.`
            + `\n\n`
            + `You can still continue the import process and install `
            + `dependencies later by yourself.`,
          )

          const { action } = await prompts({
            type: 'confirm',
            name: 'action',
            message: 'Continue the import process?',
          })
          this.log()

          if (action) {
            this.style.comment(
              `Great, let's proceed to the next step.`,
            )
            await setTimeout(200)
            break
          } else {
            this.cancelAndExit()
          }
        }

        const packageManager = packageManagersByName[action]
        if (packageManager === undefined) {
          throw new Error(`Somehow, you selected an option that does not exist.`)
        }

        return this.#interactiveNpmInstall(dirPath, packageManager)
      }
      case 'later': {
        this.style.comment(
          `Ok, but make sure to perform the appropriate actions to install `
          + `dependencies once you've completed the setup.`
          + `\n\n`
          + `If you do not, the Checkly CLI will not function as intended.`,
        )
        await setTimeout(200)
        break
      }
      default: {
        this.cancelAndExit()
      }
    }
  }

  async #loadConfig (configDirectory: string, configFilenames?: string[]): Promise<ChecklyConfig | undefined> {
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

  async #validateProject (project: Project): Promise<void> {
    this.style.actionStart('Validating project resources')

    const diagnostics = new Diagnostics()
    await project.validate(diagnostics)

    for (const diag of diagnostics.observations) {
      if (diag.isFatal()) {
        this.style.longError(diag.title, diag.message)
      } else if (!diag.isBenign()) {
        this.style.longWarning(diag.title, diag.message)
      } else {
        this.style.longInfo(diag.title, diag.message)
      }
    }

    if (diagnostics.isFatal()) {
      this.style.actionFailure()
      this.style.shortError(`Unable to continue due to unresolved validation errors.`)
      this.exit(1)
    }

    this.style.actionSuccess()
  }

  async #findExportedResources (
    configDirectory: string,
    checklyConfig: ChecklyConfig,
    rootDirectory: string,
  ): Promise<ConstructExport[]> {
    this.style.actionStart('Parsing your project')

    let project: Project
    try {
      const account = this.account
      const { data: availableRuntimes } = await api.runtimes.getAll()

      project = await parseProject({
        directory: configDirectory,
        projectLogicalId: checklyConfig.logicalId,
        projectName: checklyConfig.projectName,
        repoUrl: checklyConfig.repoUrl,
        checkMatch: checklyConfig.checks?.checkMatch,
        browserCheckMatch: checklyConfig.checks?.browserChecks?.testMatch,
        multiStepCheckMatch: checklyConfig.checks?.multiStepChecks?.testMatch,
        ignoreDirectoriesMatch: checklyConfig.checks?.ignoreDirectoriesMatch,
        checkDefaults: checklyConfig.checks,
        browserCheckDefaults: checklyConfig.checks?.browserChecks,
        availableRuntimes: availableRuntimes.reduce((acc, runtime) => {
          acc[runtime.name] = runtime
          return acc
        }, <Record<string, Runtime>> {}),
        defaultRuntimeId: account.runtimeId,
        verifyRuntimeDependencies: false,
      })

      this.style.actionSuccess()
    } catch (err) {
      this.style.actionFailure()

      throw err
    }

    await this.#validateProject(project)

    this.style.actionStart('Searching for exported resources')

    const constructExports = Session.constructExports

    this.style.actionSuccess()

    switch (constructExports.length) {
      case 0: {
        this.style.comment(
          `Did not find any exported resources.`,
        )
        break
      }
      case 1: {
        this.style.comment(
          `Found 1 exported resource.`,
        )
        break
      }
      default: {
        this.style.comment(
          `Found ${constructExports.length} exported resources.`,
        )
        break
      }
    }

    // Paths need to be relative to the root directory or our generated
    // imports won't work correctly.
    for (const constructExport of constructExports) {
      constructExport.filePath = path.relative(rootDirectory, constructExport.filePath)
    }

    return constructExports
  }

  async #confirmRetryWithoutFailed (): Promise<boolean> {
    const { action } = await prompts({
      name: 'action',
      type: 'confirm',
      message: 'Would you like to try again without the failed resources?',
    })
    this.log()

    return action ?? false
  }

  async #createImportPlan (logicalId: string, options: ImportPlanOptions): Promise<ImportPlan | undefined> {
    this.style.actionStart('Creating a new plan')

    try {
      const { data } = await api.projects.createImportPlan(logicalId, options)

      this.style.actionSuccess()

      return data
    } catch (err) {
      this.style.actionFailure()

      if (isAxiosError(err)) {
        if (err.response?.status === 404) {
          const message = err.response?.data.message
          if (message) {
            this.style.fatal(message)
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
      description: 'You will be presented with options.',
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
    this.log()

    switch (action) {
      case 'all':
        return []
      case 'choose': {
        const choices: prompts.Choice[] = await (async () => {
          this.style.actionStart('Fetching available resources')

          try {
            const { data } = await api.projects.createImportPlan(logicalId, {
              preview: true,
              filters: [{
                type: 'include',
              }],
            })

            this.style.actionSuccess()

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
            this.style.actionFailure()

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
        this.log()

        if (resources === undefined) {
          this.cancelAndExit()
        }

        if (resources.length === 0) {
          this.style.fatal(`You did not choose any resources.`)
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

  #generateCode (
    plan: ImportPlan,
    program: Program,
    codegen: ConstructCodegen,
    friendExports: FriendExports,
  ): GenerateCodeResult {
    this.style.actionStart('Generating Checkly constructs for imported resources')

    try {
      const context = new Context()

      const failures = new Map<string, FailedResource>()

      if (plan.changes) {
        const { resources, friends, auxiliary } = plan.changes

        if (friends) {
          for (const resource of friends) {
            try {
              if (friendExports[resource.type] === undefined) {
                throw new Error(`Unable to process unsupported friend resource type '${resource.type}'.`)
              }

              const friendExport = friendExports[resource.type].get(resource.logicalId)
              if (friendExport === undefined) {
                throw new Error(`Received friend resource '${resource.logicalId}' that was not requested for.`)
              }

              switch (resource.type) {
                case 'alert-channel':
                  context.registerFriendAlertChannel(resource.physicalId, friendExport)
                  break
                case 'check-group':
                  context.registerFriendCheckGroup(resource.physicalId, friendExport)
                  break
                case 'private-location':
                  context.registerFriendPrivateLocation(resource.physicalId, friendExport)
                  break
                case 'status-page-service':
                  context.registerFriendStatusPageService(resource.physicalId, friendExport)
                  break
              }
            } catch (cause) {
              throw new Error(`Failed to process friend resource '${resource.type}:${resource.physicalId}' (${resource.logicalId}): ${cause}`, { cause })
            }
          }
        }

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
                `This file has been generated to help resolve cross-snippet imports.\n`
                + `\n`
                + `We recommend rewriting your imports to not reference this file, after which\n`
                + `you may remove it.`,
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

      if (failures.size === 0) {
        this.style.actionSuccess()
      } else {
        this.style.actionFailure()
      }

      return {
        failures: [...failures.values()],
      }
    } catch (err) {
      this.style.actionFailure()

      throw err
    }
  }

  async #initializeProject (config: ChecklyConfig): Promise<void> {
    const {
      logicalId,
      projectName,
      repoUrl,
    } = config

    this.style.actionStart('Checking project status')

    try {
      await api.projects.get(logicalId)

      this.style.actionSuccess()

      // The project has already been initialized, not need to do anything.
      return
    } catch (err) {
      this.style.actionFailure()

      if (!(err instanceof ProjectNotFoundError)) {
        throw err
      }

      // The project does not exist yet and we must create (initialize) it.
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
    this.log()

    switch (action) {
      case 'init': {
        try {
          this.style.actionStart('Initializing project')

          await api.projects.create({
            name: projectName,
            logicalId,
            repoUrl,
          })

          this.style.actionSuccess()
        } catch (err) {
          this.style.actionFailure()

          throw err
        }

        break
      }
      case 'mistake':
        this.style.fatal(`Please verify your configuration and try again.`)
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
      this.log()

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
          this.log()

          if (action === 'exit') {
            this.cancelAndExit()
          }

          continue
        }
        case 'cancel-proceed': {
          this.style.actionStart('Cancelling existing plans')

          try {
            for (const plan of plans) {
              await api.projects.cancelImportPlan(plan.id)
              this.style.shortSuccess(`Cancelled plan ${plan.id}`)
            }

            this.style.actionSuccess()
          } catch (err) {
            this.style.actionFailure()

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

function previewComment (): Comment {
  return docComment(
    'This Checkly construct file has been generated for preview purposes only.'
    + '\n\n'
    + 'Deploying this file will create duplicate resources.',
  )
}

class InvalidResourceIdentifierError extends Error {}

function parseFilter (spec: string): ImportPlanFilter {
  const filter: ImportPlanFilter = {
    type: 'include',
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
