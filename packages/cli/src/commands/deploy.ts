import { setTimeout } from 'node:timers/promises'
import * as fs from 'fs/promises'
import * as api from '../rest/api.js'
import { Flags } from '@oclif/core'
import { AuthCommand } from './authCommand.js'
import { detectCliMode } from '../helpers/cli-mode.js'
import { parseProject } from '../services/project-parser.js'
import { loadChecklyConfig, resolveDependencyCacheVersion } from '../services/checkly-config-loader.js'
import {
  Check, AlertChannelSubscription, AlertChannel, CheckGroup, Dashboard,
  MaintenanceWindow, PrivateLocation, PrivateLocationCheckAssignment, PrivateLocationGroupAssignment,
  Project, ProjectData,
  Session, StatusPage, StatusPageService,
  StatusPageV3Component, StatusPageV3AutomationRule,
} from '../constructs/index.js'
import chalk from 'chalk'
import { splitConfigFilePath, getGitInformation, getGitRepoRoot } from '../services/util.js'
import commonMessages from '../messages/common-messages.js'
import { dryRunFlag, forceFlag } from '../helpers/flags.js'
import {
  DiffEntry,
  ProjectDeployResponse,
  ProjectDeployCancelledError,
  ProjectPlanStaleError,
  ProjectPreviewNotSupportedError,
  ProjectPreviewResponse,
  ProjectSync,
} from '../rest/projects.js'
import { ConflictError } from '../rest/errors.js'
import { stripUnsupportedDeployFields } from '../services/deploy-diff/legacy-payload.js'
import {
  isPrunedRelation,
  onlyUnmanagedChanges,
  planChangeLines,
  reducePlanForAgent,
} from '../services/deploy-diff/plan-summary.js'
import { uploadSnapshots } from '../services/snapshot-service.js'
import { BrowserCheckBundle } from '../constructs/browser-check-bundle.js'
import { Runtime } from '../runtimes/index.js'
import { Bundler } from '../services/check-parser/bundler.js'

// eslint-disable-next-line no-restricted-syntax
enum ResourceDeployStatus {
  UPDATE = 'UPDATE',
  CREATE = 'CREATE',
  DELETE = 'DELETE',
  // Reported for a resource removed from code that is kept in the account
  // (managed from the Checkly web app from then on) instead of deleted.
  DETACH = 'DETACH',
  // What the same case was called before the deploy diff landed. Still
  // accepted so a newer CLI keeps rendering an older API's answer.
  DETACHED = 'DETACHED',
  // A resource the deploy leaves alone because code and account agree.
  UNCHANGED = 'UNCHANGED',
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
  [StatusPageV3Component.__checklyType]: 'StatusPageV3Component',
  [StatusPageV3AutomationRule.__checklyType]: 'StatusPageV3AutomationRule',
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
      description: 'Keep resources removed from code (and their run history) in your Checkly account instead of deleting them.',
      default: false,
    }),
    'force': forceFlag(),
    'dry-run': dryRunFlag(),
    'plan-token': Flags.string({
      description: 'Deploy only if the plan still matches this token from an earlier run. '
        + 'Aborts if anything changed in your Checkly account since then.',
    }),
    'prune-relations': Flags.boolean({
      description: 'Delete the alert channel subscriptions and private location assignments on this project\'s '
        + 'checks and groups that the project does not manage.',
      default: false,
    }),
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
    const { flags, metadata } = await this.parse(Deploy)
    const {
      force,
      preview,
      'dry-run': dryRun,
      'plan-token': requestedPlanToken,
      'prune-relations': pruneRelations,
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
      diagnostics: configDiagnostics,
    } = await loadChecklyConfig(configDirectory, configFilenames)
    const account = this.account

    // The confirmation happens further down, once the project has been parsed
    // and Checkly has said what the deploy would change, so that one prompt
    // can show the actual plan instead of asking about a deploy nobody has
    // seen yet.

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
      embeddedPackages: checklyConfig.bundle?.packages?.embed,
      playwrightChecks: checklyConfig.checks?.playwrightChecks,
    })
    const repoInfo = getGitInformation(project.repoUrl)
    const repoRoot = getGitRepoRoot()

    this.style.actionSuccess()

    await this.validateProject(project, { configDiagnostics })

    const bundler = await Bundler.createForWorkspace(Session.workspace.unwrap(), {
      dependencyCacheVersion: resolveDependencyCacheVersion(checklyConfig),
      embeddedPackagesMaterializer: Session.getEmbeddedPackagesMaterializer(),
      packageManager: Session.packageManager,
      packagePrune: checklyConfig.bundle?.packages?.prune,
      runnerRegistries: checklyConfig.runner?.registries,
    })

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

    const browserBundles: BrowserCheckBundle[] = Object.values(projectBundle.data.check)
      .map(({ bundle }) => bundle)
      .filter((bundle): bundle is BrowserCheckBundle => bundle instanceof BrowserCheckBundle)

    // Uploading is what produces the storage keys a deploy needs, and it is
    // deferred until the plan has been accepted: a preview describes the code
    // bundle and every snapshot by content hash, so finding out what a deploy
    // would change costs no uploads. Idempotent because the fallback path for
    // an API without the preview endpoint has to upload earlier — its diff
    // comes from a dry-run deploy, which requires the keys.
    let uploaded = false
    const uploadArtifacts = async () => {
      if (uploaded) {
        return
      }
      uploaded = true

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

      if (browserBundles.length) {
        this.style.actionStart('Uploading Playwright snapshots')
        try {
          for (const bundle of browserBundles) {
            bundle.snapshots = await uploadSnapshots(bundle.rawSnapshots)
          }
          this.style.actionSuccess()
        } catch (err) {
          this.style.actionFailure()
          throw err
        }
      }
    }

    // Synthesized on demand rather than once: the snapshot entries are copied
    // into the payload as values, so the payload sent after the upload has to
    // be built after it to carry the keys.
    const synthesize = (): ProjectSync => ({ ...projectBundle.synthesize({ repoRoot }), repoInfo })

    const projectPayload = synthesize()
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

    const summaryOptions = { prettyTypes: PRETTY_RESOURCE_TYPES, foldedTypes: NON_REPORTED_TYPES }
    const classification = {
      readOnly: Deploy.readOnly,
      destructive: Deploy.destructive,
      idempotent: Deploy.idempotent,
    }
    // What the deploy does whatever it finds, worded as the confirmation
    // prompt words it. The plan's own lines follow these.
    const optionLines = [
      `Deploy project "${checklyConfig.projectName}" to account "${account.name}"`,
      scheduleOnDeploy
        ? 'Schedule checks after deploy'
        : 'Checks will NOT be scheduled after deploy',
      preserveResources
        ? 'Keep any resources removed from code (and their run history) in your Checkly account, where you can manage them from the Checkly web app'
        : 'Delete any resources removed from code, losing their run history. Pass --preserve-resources to keep them in your Checkly account instead',
      ...pruneRelations
        ? ['Delete the alert channel subscriptions and private location assignments on this project\'s checks '
          + 'and groups that the project does not manage']
        : [],
    ]

    // Ask Checkly what this payload would change. Writes nothing, and needs no
    // upload: the payload describes the code bundle and every snapshot by
    // content hash.
    // `full` buys the text behind the values Checkly holds hashed, and today
    // the only thing that reports those values is the machine-readable
    // envelope: `--dry-run`, and the `confirmation_required` an agent or CI run
    // prints. The terminal output lists resources, not properties, so asking
    // for `full` there would download every changed resource's full state —
    // which the backend has to materialize — and print none of it.
    const detail = dryRun || (!preview && !force && detectCliMode() !== 'interactive') ? 'full' : 'changes'

    let plan: ProjectPreviewResponse | undefined
    // Set when the API has no preview endpoint, which also means it rejects the
    // payload fields that arrived with it.
    let previewNotSupported = false
    this.style.actionStart('Checking what would change')
    try {
      plan = await api.projects.preview(projectPayload, {
        detail,
        preserveResources,
        pruneRelations,
        onStatus: message => this.style.actionStatus(message),
      })
      this.style.actionSuccess()
    } catch (err: any) {
      this.style.actionFailure()
      previewNotSupported = err instanceof ProjectPreviewNotSupportedError
      const previewSupported = !previewNotSupported

      // --prune-relations deletes data, and without a plan nothing can say
      // what: an API that predates the preview endpoint would not prune at all,
      // and an API that would prune cannot be asked what it is about to delete.
      // Both are refused rather than silently downgraded.
      if (pruneRelations) {
        this.style.longError(
          previewSupported
            ? 'Could not check which relations --prune-relations would delete, so nothing was deployed.'
            : 'This Checkly API cannot prune relations yet.',
          previewSupported ? 'Try again in a moment.' : 'Re-run without --prune-relations.',
        )
        this.exit(1)
      }

      // A deploy pinned to a plan cannot proceed without knowing the plan.
      if (requestedPlanToken !== undefined) {
        this.style.longError(
          'Could not check the plan this deploy is pinned to.',
          previewSupported
            ? err.message
            : 'This Checkly API does not support deploy previews; re-run without --plan-token.',
        )
        this.exit(1)
      }

      // Deploying without a reviewed plan beats not deploying at all: one
      // resource Checkly cannot read, or an API that is a version behind, must
      // not make a project undeployable. The run falls back to the coarser
      // dry-run diff and its delete guard, and sends no plan token.
      this.style.longWarning(
        previewSupported
          // Say which failure it was: the user is about to get a coarser answer
          // than they asked for and deserves to know why.
          ? `Could not check what this deploy would change: ${err.message}`
          // A 404 from this path means the endpoint is not there; whether that
          // is an API predating it or something else in the way, the CLI cannot
          // tell, so it says what it observed.
          : 'This Checkly API answered 404 for the deploy preview endpoint.',
        'Falling back to a summary of created, updated and deleted resources.',
      )
    }

    if (plan !== undefined && requestedPlanToken !== undefined && requestedPlanToken !== plan.planToken) {
      this.style.longError(
        'Your Checkly account no longer matches the plan this deploy is pinned to, so nothing was deployed.',
        'Re-run `checkly deploy --preview` to see the current plan.',
      )
      this.exit(1)
    }

    // The payload goes out in the form the deploy route accepted before the
    // preview endpoint existed in exactly the two cases where the full one
    // cannot be sent: an API that does not have the endpoint rejects the fields
    // that arrived with it, and a run that skipped the uploads describes
    // snapshots it has no storage key for, which every write route requires.
    //
    // Not for every missing plan: a preview that failed transiently against a
    // current API leaves the fields perfectly acceptable, and stripping them
    // would blank the stored content hashes — making the NEXT deploy report
    // every Playwright suite and every snapshot-bearing check as changed.
    const deployPayload = (): ProjectSync =>
      previewNotSupported || !uploaded ? stripUnsupportedDeployFields(synthesize()) : synthesize()

    // Without a plan, deletions are only visible in a dry-run deploy — which
    // validates the storage keys, so the uploads have to happen first.
    let fallbackDiff: ProjectDeployResponse | undefined
    if (plan === undefined && (preview || dryRun || (!preserveResources && !force))) {
      // A run that only reports needs no uploads: the dry run validates the
      // payload it is given, and a code bundle it has not been handed a key for
      // is described by its path on disk, as it was before the preview endpoint
      // existed.
      if (!preview && !dryRun) {
        await uploadArtifacts()
      }
      this.style.actionStart('Verifying deployed state')
      try {
        const { data } = await api.projects.deploy(deployPayload(), {
          dryRun: true,
          scheduleOnDeploy,
          preserveResources,
        })
        fallbackDiff = data
        this.style.actionSuccess()
      } catch (err: any) {
        this.style.actionFailure()
        this.style.longError(`Your project could not be deployed.`, err)
        this.exit(1)
      }
    }

    if (preview && !dryRun) {
      this.log(this.formatPreview(
        { diff: plan?.diff ?? fallbackDiff?.diff ?? [] },
        project,
        verbose,
        pruneRelations,
      ))
      if (plan !== undefined) {
        this.log(`Plan token: ${plan.planToken}`)
        this.log(chalk.grey(
          `Deploy this exact plan with \`checkly deploy --plan-token ${plan.planToken}\`.\n`,
        ))
      }
      return
    }

    // With a plan, every touched resource has a line; without one, only the
    // deletions the dry run found are known.
    const planLines = plan !== undefined
      ? planChangeLines(plan.diff, summaryOptions)
      : this.collectDeletions(fallbackDiff?.diff ?? [])
          .map(({ resourceType, logicalId }) =>
            `Permanently delete ${PRETTY_RESOURCE_TYPES[resourceType] ?? resourceType}: ${logicalId}, `
            + 'losing its run history')

    // The one confirmation of the command: the plan is known by now, so the
    // prompt, the agent envelope and --dry-run all describe the deploy that is
    // about to run rather than a deploy nobody has seen.
    await this.confirmOrAbort({
      command: 'deploy',
      description: 'Deploy project to Checkly',
      changes: [...optionLines, ...planLines],
      // The token rides along in the echoed command, so the confirming run
      // deploys the plan that was shown here and refuses a different one.
      flags: plan !== undefined ? { ...flags, 'plan-token': plan.planToken } : flags,
      flagMetadata: metadata.flags,
      classification,
      ...plan !== undefined
        ? { preview: { planToken: plan.planToken, diff: reducePlanForAgent(plan.diff) } }
        : {},
    }, { force, dryRun })

    await uploadArtifacts()

    const runDeploy = () => api.projects.deploy(
      deployPayload(),
      {
        scheduleOnDeploy,
        preserveResources,
        pruneRelations,
        planToken: plan?.planToken,
        cancelInProgress,
        onProgress: progress => this.style.actionStatus(`${progress}% complete`),
        onStatus: message => this.style.actionStatus(message),
      },
    )

    try {
      this.style.actionStart('Deploying project')
      let data: ProjectDeployResponse
      try {
        ({ data } = await runDeploy())
      } catch (err) {
        // A run that showed nobody a plan has nothing to protect: rather than
        // failing a pipeline because someone touched the account while the code
        // bundle was uploading, it plans again and deploys that. A pinned run,
        // or one a person confirmed, is refused instead — see the catch below.
        if (!(err instanceof ProjectPlanStaleError) || !force || requestedPlanToken !== undefined) {
          throw err
        }
        this.style.actionStatus('Your Checkly account changed; checking again and deploying the current plan')
        plan = await api.projects.preview(deployPayload(), { detail, preserveResources, pruneRelations })
        ;({ data } = await runDeploy())
      }
      this.style.actionSuccess()
      if (output) {
        this.log(this.formatPreview(data, project, verbose, pruneRelations))
      }
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
    } catch (err: any) {
      this.style.actionFailure()
      if (err instanceof ProjectPlanStaleError) {
        // Nothing was written. The way out is another run, which previews
        // afresh: this run's token describes a state Checkly has left behind,
        // so sending it again would be refused again.
        if (err.diff.length) {
          this.log(this.formatPreview({ diff: err.diff }, project, verbose, pruneRelations))
          this.style.longError(
            'Your Checkly account changed while this deploy was being confirmed, so nothing was deployed.',
            'The plan above is the current one. Re-run `checkly deploy` to review and deploy it.',
          )
        } else {
          // A refusal with no plan attached: the account moved for a reason the
          // error itself explains, and there is nothing to print above.
          this.style.longError(
            `${err.message} Nothing was deployed.`,
            'Re-run `checkly deploy` to see the current plan and deploy it.',
          )
        }
      } else if (err instanceof ProjectDeployCancelledError) {
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

  private collectDeletions (diff: DiffEntry[]): Array<{ resourceType: string, logicalId: string }> {
    return diff
      .filter(change =>
        change.action === ResourceDeployStatus.DELETE
        // A resource the project no longer declares, not a relation it never
        // managed: pruning those is reported under its own heading.
        && change.origin !== 'unmanaged'
        && !NON_REPORTED_TYPES.some(t => t === change.type),
      )
      .map(({ type, logicalId }) => ({ resourceType: type, logicalId }))
      .sort((a, b) =>
        a.resourceType.localeCompare(b.resourceType) || a.logicalId.localeCompare(b.logicalId),
      )
  }

  private formatPreview (
    previewData: { diff: DiffEntry[] },
    project: Project,
    verbose = false,
    /** Whether this deploy deletes the relations it does not manage. */
    pruneRelations = false,
  ): string {
    // Current format of the data is: { checks: { logical-id-1: 'UPDATE' }, groups: { another-logical-id: 'CREATE' } }
    // We convert it into update: [{ logicalId, resourceType, construct }, ...], create: [], delete: []
    // This makes it easier to display.
    const updating = []
    const creating = []
    const deleting: Array<{ resourceType: string, logicalId: string }> = []
    const detaching: Array<{ resourceType: string, logicalId: string }> = []
    const pruning: Array<{ resourceType: string, logicalId: string }> = []
    const unmanaged: Array<{ resourceType: string, logicalId: string }> = []
    let unchanged = 0
    for (const change of previewData?.diff ?? []) {
      const { type, logicalId, physicalId, action, changes } = change
      if (NON_REPORTED_TYPES.some(t => t === type)) {
        // A relation the project manages is reported as part of the check or
        // group it belongs to, since users do not declare these directly. One
        // the project does NOT manage is only ever reported when --prune-relations
        // would delete it, and that is worth its own line.
        if (isPrunedRelation(change)) {
          pruning.push({ resourceType: type, logicalId })
        }
        continue
      }
      // Relations the project does not manage are reported on their owning
      // check or group whether or not they would be deleted. Without
      // --prune-relations the deploy leaves them — and the resource — alone, so
      // listing it as an update would name a write that never happens.
      // Never an update: what the deploy deletes is the relation, not the
      // check or group it hangs off. With --prune-relations the relation's own
      // entry is already listed under Prune, so the resource needs no line of
      // its own — and advising the flag the user just passed would be absurd.
      if (onlyUnmanagedChanges(change)) {
        if (!pruneRelations) {
          unmanaged.push({ resourceType: type, logicalId })
        }
        continue
      }
      const construct = project.data[type as keyof ProjectData][logicalId]
      if (action === ResourceDeployStatus.UPDATE) {
        updating.push({ resourceType: type, logicalId, physicalId, construct })
      } else if (action === ResourceDeployStatus.UNCHANGED) {
        // A resource whose own properties agree with the account can still have
        // changed alert channels or private locations, which are reported on it
        // rather than as resources of their own; only an entry with nothing at
        // all to report counts as unchanged.
        if ((changes?.length ?? 0) > 0) {
          updating.push({ resourceType: type, logicalId, physicalId, construct })
        } else {
          unchanged++
        }
      } else if (action === ResourceDeployStatus.CREATE) {
        creating.push({ resourceType: type, logicalId, physicalId, construct })
      } else if (action === ResourceDeployStatus.DELETE) {
        // Since the resource is being deleted, the construct isn't in the project.
        deleting.push({ resourceType: type, logicalId })
      } else if (
        action === ResourceDeployStatus.DETACH
        || action === ResourceDeployStatus.DETACHED
      ) {
        // Removed from code but kept in the account, so the construct is not in
        // the project any more.
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

    const sortedPruning = pruning
      .sort(compareEntries)

    const sortedUnmanaged = unmanaged
      .sort(compareEntries)

    if (!sortedCreating.length && !sortedDeleting.length && !sortedDetaching.length
      && !sortedUpdating.length && !sortedPruning.length && !sortedUnmanaged.length
      && !unchanged && !skipping.length) {
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
      output.push(chalk.bold.yellow('Kept in your Checkly account (removed from code, now managed from the Checkly web app):'))
      for (const { resourceType, logicalId } of sortedDetaching) {
        output.push(`    ${PRETTY_RESOURCE_TYPES[resourceType] ?? resourceType}: ${logicalId}`)
      }
      output.push('')
    }
    if (sortedPruning.length) {
      output.push(chalk.bold.red('Prune (relations not managed by this project):'))
      for (const { resourceType, logicalId } of sortedPruning) {
        output.push(`    ${PRETTY_RESOURCE_TYPES[resourceType] ?? resourceType}: ${logicalId}`)
      }
      output.push('')
    }
    if (sortedUpdating.length) {
      output.push(chalk.bold.magenta('Update:'))
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
    if (sortedUnmanaged.length) {
      output.push(chalk.bold.yellow(
        'Has alert channels or private locations this project does not manage (pass --prune-relations to delete them):',
      ))
      for (const { resourceType, logicalId } of sortedUnmanaged) {
        output.push(`    ${PRETTY_RESOURCE_TYPES[resourceType] ?? resourceType}: ${logicalId}`)
      }
      output.push('')
    }
    if (unchanged) {
      output.push(chalk.bold.grey(`Unchanged: ${unchanged}`))
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
