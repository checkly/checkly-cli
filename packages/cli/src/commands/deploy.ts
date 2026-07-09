import { setTimeout } from 'node:timers/promises'
import * as fs from 'fs/promises'
import * as api from '../rest/api.js'
import { Flags } from '@oclif/core'
import { AuthCommand } from './authCommand.js'
import { parseProject } from '../services/project-parser.js'
import { loadChecklyConfig } from '../services/checkly-config-loader.js'
import {
  Check, AlertChannelSubscription, AlertChannel, CheckGroup, Dashboard,
  MaintenanceWindow, PrivateLocation, PrivateLocationCheckAssignment, PrivateLocationGroupAssignment,
  Project, ProjectData, Diagnostics,
  Session, StatusPage, StatusPageService,
} from '../constructs/index.js'
import chalk from 'chalk'
import { splitConfigFilePath, getGitInformation } from '../services/util.js'
import commonMessages from '../messages/common-messages.js'
import { forceFlag } from '../helpers/flags.js'
import { ProjectDeployResponse, ProjectDeployCancelledError } from '../rest/projects.js'
import { ConflictError } from '../rest/errors.js'
import { uploadSnapshots } from '../services/snapshot-service.js'
import { BrowserCheckBundle } from '../constructs/browser-check-bundle.js'
import { Runtime } from '../runtimes/index.js'
import { Bundler } from '../services/check-parser/bundler.js'

// eslint-disable-next-line no-restricted-syntax
enum ResourceDeployStatus {
  UPDATE = 'UPDATE',
  CREATE = 'CREATE',
  DELETE = 'DELETE',
  // Returned by newer backends for resources removed from code that are kept in
  // the account (detached, now managed in the Checkly Webapp) instead of deleted.
  DETACHED = 'DETACHED',
}

const PRETTY_RESOURCE_TYPES: Record<string, string> = {
  [Check.__checklyType]: 'Check',
  [AlertChannel.__checklyType]: 'AlertChannel',
  [CheckGroup.__checklyType]: 'CheckGroup',
  [MaintenanceWindow.__checklyType]: 'MaintenanceWindow',
  [PrivateLocation.__checklyType]: 'PrivateLocation',
  [Dashboard.__checklyType]: 'Dashboard',
  [StatusPage.__checklyType]: 'StatusPage',
  [StatusPageService.__checklyType]: 'StatusPageService',
}

// Internal resources that users don't create directly. They are reported as
// part of their owning check, so we exclude them from delete previews/guards.
const NON_REPORTED_TYPES = [
  AlertChannelSubscription.__checklyType,
  PrivateLocationCheckAssignment.__checklyType,
  PrivateLocationGroupAssignment.__checklyType,
]

export default class Deploy extends AuthCommand {
  static coreCommand = true
  static hidden = false
  static idempotent = true
  static description = 'Deploy your project to your Checkly account.'

  static flags = {
    'preview': Flags.boolean({
      char: 'p',
      description: 'Show a preview of the changes made by the deploy command.',
      default: false,
    }),
    'output': Flags.boolean({
      char: 'o',
      description: 'Shows the changes made after the deploy command.',
      default: false,
    }),
    'verbose': Flags.boolean({
      char: 'v',
      description: 'Show resource names and IDs in the deploy output.',
      default: false,
    }),
    'schedule-on-deploy': Flags.boolean({
      description: 'Enables automatic check scheduling after a deploy.',
      default: true,
      allowNo: true,
    }),
    'preserve-resources': Flags.boolean({
      description: 'Detach resources removed from code (keep them and their run history) instead of deleting them.',
      default: false,
    }),
    'force': forceFlag(),
    'cancel-in-progress-deployment': Flags.boolean({
      description: 'If a deployment for this project is already in progress, cancel it instead of waiting for it to finish.',
      default: false,
    }),
    'config': Flags.string({
      char: 'c',
      description: commonMessages.configFile,
    }),
    'verify-runtime-dependencies': Flags.boolean({
      description: '[default: true] Return an error if checks import dependencies that are not supported by the selected runtime.',
      default: true,
      allowNo: true,
      env: 'CHECKLY_VERIFY_RUNTIME_DEPENDENCIES',
    }),
    'debug-bundle': Flags.boolean({
      description: 'Output the project bundle to a file without deploying any resources.',
      default: false,
      hidden: true,
    }),
    'debug-bundle-output-file': Flags.string({
      description: 'The file to output the debug debug bundle to.',
      default: './debug-bundle.json',
      hidden: true,
    }),
  }

  async run (): Promise<void> {
    const { flags } = await this.parse(Deploy)
    const {
      force,
      preview,
      'cancel-in-progress-deployment': cancelInProgress,
      'schedule-on-deploy': scheduleOnDeploy,
      'preserve-resources': preserveResources,
      output: outputFlag,
      verbose,
      config: configFilename,
      'verify-runtime-dependencies': verifyRuntimeDependencies,
      'debug-bundle': debugBundle,
      'debug-bundle-output-file': debugBundleOutputFile,
    } = flags
    const output = outputFlag || verbose
    const { configDirectory, configFilenames } = splitConfigFilePath(configFilename)
    const {
      config: checklyConfig,
      constructs: checklyConfigConstructs,
    } = await loadChecklyConfig(configDirectory, configFilenames)
    const account = this.account

    if (!preview) {
      await this.confirmOrAbort({
        command: 'deploy',
        description: 'Deploy project to Checkly',
        changes: [
          `Deploy project "${checklyConfig.projectName}" to account "${account.name}"`,
          scheduleOnDeploy
            ? 'Schedule checks after deploy'
            : 'Checks will NOT be scheduled after deploy',
          preserveResources
            ? 'Detach any resources removed from code, keeping them and their run history for management in the Checkly Webapp'
            : 'Delete any resources removed from code, losing their run history. Pass --preserve-resources to detach and keep them instead',
        ],
        flags,
        classification: {
          readOnly: Deploy.readOnly,
          destructive: Deploy.destructive,
          idempotent: Deploy.idempotent,
        },
      }, { force })
    }

    this.style.actionStart('Parsing your project')

    const availableRuntimes = await api.runtimes.getAll()
    const project = await parseProject({
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
      verifyRuntimeDependencies,
      checklyConfigConstructs,
      playwrightConfigPath: checklyConfig.checks?.playwrightConfigPath,
      include: checklyConfig.checks?.include,
      playwrightChecks: checklyConfig.checks?.playwrightChecks,
    })
    const repoInfo = getGitInformation(project.repoUrl)

    this.style.actionSuccess()

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

    const bundler = await Bundler.createForWorkspace(Session.workspace.unwrap())

    this.style.actionStart('Bundling project resources')
    const projectBundle = await (async () => {
      try {
        const bundle = await project.bundle(bundler)
        this.style.actionSuccess()
        return bundle
      } catch (err) {
        this.style.actionFailure()
        throw err
      }
    })()

    const archive = await bundler.finalize()
    bundler.updateMarker(archive.archiveFile)

    // The remote code bundle is only consumed by Playwright check suites (via
    // bundler.marker). If nothing registered files to bundle (e.g. a project of
    // only uptime monitors), there is nothing to upload — skip the store() to
    // avoid an unnecessary code-bundle upload.
    if (!bundler.isEmpty) {
      this.style.actionStart('Uploading Playwright tests')
      try {
        const storedArchive = await archive.store()
        bundler.updateMarker(storedArchive.key)
        this.style.actionSuccess()
      } catch (err) {
        this.style.actionFailure()
        throw err
      }
    }

    const bundledChecksByType = {
      browser: [] as string[],
    }

    for (const [logicalId, { bundle }] of Object.entries(projectBundle.data.check)) {
      if (bundle instanceof BrowserCheckBundle) {
        bundledChecksByType.browser.push(logicalId)
      }
    }

    if (!preview && bundledChecksByType.browser.length) {
      this.style.actionStart('Uploading Playwright snapshots')
      try {
        for (const logicalId of bundledChecksByType.browser) {
          const bundle = projectBundle.data.check[logicalId].bundle as BrowserCheckBundle
          bundle.snapshots = await uploadSnapshots(bundle.rawSnapshots)
        }
        this.style.actionSuccess()
      } catch (err) {
        this.style.actionFailure()
        throw err
      }
    }

    const projectPayload = projectBundle.synthesize()
    if (!projectPayload.resources.length) {
      if (preview) {
        this.log('\nNo checks were detected. More information on how to set up a Checkly CLI project is available at https://checklyhq.com/docs/cli/.\n')
        return
      } else {
        throw new Error('Failed to deploy your project. Unable to find constructs to deploy.\nMore information on how to set up a Checkly CLI project is available at https://checklyhq.com/docs/cli/.\n')
      }
    }

    if (debugBundle) {
      const output = JSON.stringify(projectPayload, null, 2)
      await fs.writeFile(debugBundleOutputFile, output, 'utf8')
      this.log(`Successfully wrote debug bundle to "${debugBundleOutputFile}".`)
      return
    }

    // Preflight destructive-delete guard. Deletions are only known from the diff,
    // which we don't have until after a deploy call. For a non-preview, non-preserve
    // run that isn't already forced, do a dry-run first to surface resources that
    // would be permanently deleted and require an explicit confirmation.
    if (!preview && !preserveResources && !force) {
      let deletions: Array<{ resourceType: string, logicalId: string }> = []
      try {
        const { data: dryRunData } = await api.projects.deploy(
          { ...projectPayload, repoInfo },
          { dryRun: true, scheduleOnDeploy, preserveResources },
        )
        deletions = this.collectDeletions(dryRunData)
      } catch (err: any) {
        this.style.longError(`Your project could not be deployed.`, err)
        this.exit(1)
      }

      if (deletions.length) {
        this.log(chalk.bold.red('\nThe following resources were removed from code and will be DELETED, losing their run history:'))
        for (const { resourceType, logicalId } of deletions) {
          this.log(chalk.red(`    ${PRETTY_RESOURCE_TYPES[resourceType] ?? resourceType}: ${logicalId}`))
        }
        this.log(chalk.yellow('\nPass --preserve-resources to detach and keep them (and their run history) instead.\n'))

        await this.confirmOrAbort({
          command: 'deploy',
          description: 'Delete resources removed from code',
          changes: [
            `Permanently delete ${deletions.length} resource(s) removed from code, losing their run history`,
            ...deletions.map(({ resourceType, logicalId }) =>
              `Delete ${PRETTY_RESOURCE_TYPES[resourceType] ?? resourceType}: ${logicalId}`),
          ],
          flags,
          classification: {
            readOnly: Deploy.readOnly,
            destructive: Deploy.destructive,
            idempotent: Deploy.idempotent,
          },
        }, { force })
      }
    }

    try {
      if (!preview) {
        this.style.actionStart('Deploying project')
      }
      const { data } = await api.projects.deploy(
        { ...projectPayload, repoInfo },
        {
          dryRun: preview,
          scheduleOnDeploy,
          preserveResources,
          cancelInProgress,
          onProgress: preview ? undefined : progress => this.style.actionStatus(`${progress}% complete`),
          onStatus: preview ? undefined : message => this.style.actionStatus(message),
        },
      )
      if (!preview) {
        this.style.actionSuccess()
      }
      if (preview || output) {
        this.log(this.formatPreview(data, project, verbose))
      }
      if (!preview) {
        await setTimeout(500)
        this.log(`Successfully deployed project "${project.name}" to account "${account.name}".`)

        // Print the ping URL for heartbeat checks.
        const heartbeatLogicalIds = project.getHeartbeatLogicalIds()
        const heartbeatCheckIds = data.diff.filter(check => heartbeatLogicalIds.includes(check.logicalId))
          .map(check => check?.physicalId)

        heartbeatCheckIds.forEach(async id => {
          const { data: { pingUrl, name } } = await api.heartbeatCheck.get(id as string)
          this.log(`Ping URL of heartbeat check ${chalk.green(name)} is ${chalk.italic.underline.blue(pingUrl)}.`)
        })
      }
    } catch (err: any) {
      if (!preview) {
        this.style.actionFailure()
      }
      if (err instanceof ProjectDeployCancelledError) {
        this.style.longError('Your deployment was cancelled.', err.message)
      } else if (err instanceof ConflictError) {
        // deploy() waits-and-retries behind an in-progress deployment, so a 409
        // only reaches here once that wait exceeded its deadline.
        this.style.longError(
          'A deployment for this project is still in progress.',
          'Try again later, or re-run with `--cancel-in-progress-deployment` to '
          + 'cancel the running deployment and deploy now.',
        )
      } else {
        this.style.longError(`Your project could not be deployed.`, err)
      }
      this.exit(1)
    }
  }

  private collectDeletions (previewData: ProjectDeployResponse): Array<{ resourceType: string, logicalId: string }> {
    return (previewData?.diff ?? [])
      .filter(change =>
        change.action === ResourceDeployStatus.DELETE
        && !NON_REPORTED_TYPES.some(t => t === change.type),
      )
      .map(({ type, logicalId }) => ({ resourceType: type, logicalId }))
      .sort((a, b) =>
        a.resourceType.localeCompare(b.resourceType) || a.logicalId.localeCompare(b.logicalId),
      )
  }

  private formatPreview (
    previewData: ProjectDeployResponse,
    project: Project,
    verbose = false,
  ): string {
    // Current format of the data is: { checks: { logical-id-1: 'UPDATE' }, groups: { another-logical-id: 'CREATE' } }
    // We convert it into update: [{ logicalId, resourceType, construct }, ...], create: [], delete: []
    // This makes it easier to display.
    const updating = []
    const creating = []
    const deleting: Array<{ resourceType: string, logicalId: string }> = []
    const detaching: Array<{ resourceType: string, logicalId: string }> = []
    for (const change of previewData?.diff ?? []) {
      const { type, logicalId, physicalId, action } = change
      if ([
        AlertChannelSubscription.__checklyType,
        PrivateLocationCheckAssignment.__checklyType,
        PrivateLocationGroupAssignment.__checklyType,
      ].some(t => t === type)) {
        // Don't report changes to alert channel subscriptions or private location assignments.
        // Users don't create these directly, so it's more intuitive to consider it as part of the check.
        continue
      }
      const construct = project.data[type as keyof ProjectData][logicalId]
      if (action === ResourceDeployStatus.UPDATE) {
        updating.push({ resourceType: type, logicalId, physicalId, construct })
      } else if (action === ResourceDeployStatus.CREATE) {
        creating.push({ resourceType: type, logicalId, physicalId, construct })
      } else if (action === ResourceDeployStatus.DELETE) {
        // Since the resource is being deleted, the construct isn't in the project.
        deleting.push({ resourceType: type, logicalId })
      } else if (action === ResourceDeployStatus.DETACHED) {
        // Newer backends report detached resources explicitly. The construct
        // isn't in the project since it was removed from code.
        detaching.push({ resourceType: type, logicalId })
      }
    }

    // testOnly checks weren't sent to the BE and won't be in previewData.
    // We load them from the `project` instead.
    const skipping = project
      .getTestOnlyConstructs().map(construct => ({
        logicalId: construct.logicalId,
        resourceType: construct.type,
        construct,
      }))
      // There is an edge case when the check already exists in Checkly, but `testOnly: true` was just added.
      // In this case, the check will be included in both `deleting` and `skipping`.
      // To avoid displaying the check twice, we detect this case and only show the check in `deleting`.
      // This implementation is O(n^2), but could be sped up with a map or set.
      .filter(skip =>
        !deleting.find(
          deletion => deletion.logicalId === skip.logicalId && deletion.resourceType === skip.resourceType,
        ),
      )

    // Having some order will make the output easier to read.
    const compareEntries = (a: any, b: any) =>
      a.resourceType.localeCompare(b.resourceType)
      || a.logicalId.localeCompare(b.logicalId)

    // filter resources without contructs that are created dynamically
    // on the flight (i.e. a non project member private-location)
    const sortedUpdating = updating
      .filter(({ construct }) => Boolean(construct))
      .sort(compareEntries)

    // filter resources without contructs that are created dynamically
    // on the flight (i.e. a non project member private-location)
    const sortedCreating = creating
      .filter(({ construct }) => Boolean(construct))
      .sort(compareEntries)

    const sortedDeleting = deleting
      .sort(compareEntries)

    const sortedDetaching = detaching
      .sort(compareEntries)

    if (!sortedCreating.length && !sortedDeleting.length && !sortedDetaching.length
      && !sortedUpdating.length && !skipping.length) {
      return '\nNo checks were detected. More information on how to set up a Checkly CLI project is available at https://checklyhq.com/docs/cli/.\n'
    }

    const output = []

    if (sortedCreating.filter(({ construct }) => Boolean(construct)).length) {
      output.push(chalk.bold.green('Create:'))
      for (const { logicalId, physicalId, construct } of sortedCreating) {
        output.push(`    ${construct.constructor.name}: ${logicalId}`)
        if (verbose && (construct as any).name) {
          output.push(`      name: ${(construct as any).name}`)
        }
        if (verbose && physicalId) {
          output.push(`      id: ${physicalId}`)
        }
      }
      output.push('')
    }
    if (sortedDeleting.length) {
      output.push(chalk.bold.red('Delete:'))
      for (const { resourceType, logicalId } of sortedDeleting) {
        output.push(`    ${PRETTY_RESOURCE_TYPES[resourceType] ?? resourceType}: ${logicalId}`)
      }
      output.push('')
    }
    if (sortedDetaching.length) {
      output.push(chalk.bold.yellow('Detached (kept in account, now managed in the Checkly Webapp):'))
      for (const { resourceType, logicalId } of sortedDetaching) {
        output.push(`    ${PRETTY_RESOURCE_TYPES[resourceType] ?? resourceType}: ${logicalId}`)
      }
      output.push('')
    }
    if (sortedUpdating.length) {
      output.push(chalk.bold.magenta('Update and Unchanged:'))
      for (const { logicalId, physicalId, construct } of sortedUpdating) {
        output.push(`    ${construct.constructor.name}: ${logicalId}`)
        if (verbose && (construct as any).name) {
          output.push(`      name: ${(construct as any).name}`)
        }
        if (verbose && physicalId) {
          output.push(`      id: ${physicalId}`)
        }
      }
      output.push('')
    }
    if (skipping.length) {
      output.push(chalk.bold.grey('Skip (testOnly):'))
      for (const { logicalId, construct } of skipping) {
        output.push(`    ${construct.constructor.name}: ${logicalId}`)
      }
      output.push('')
    }
    return output.join('\n')
  }
}
