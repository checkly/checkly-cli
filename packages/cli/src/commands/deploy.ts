import { setTimeout } from 'node:timers/promises'
import * as fs from 'fs/promises'
import * as api from '../rest/api.js'
import { Flags } from '@oclif/core'
import { AuthCommand } from './authCommand.js'
import { parseProject } from '../services/project-parser.js'
import { loadChecklyConfig, resolveDependencyCacheVersion } from '../services/checkly-config-loader.js'
import { Session } from '../constructs/index.js'
import chalk from 'chalk'
import { splitConfigFilePath, getGitInformation, getGitRepoRoot } from '../services/util.js'
import commonMessages from '../messages/common-messages.js'
import { autoOrWholeNumberFlag, dryRunFlag, forceFlag } from '../helpers/flags.js'
import {
  formatPreview,
  NON_REPORTED_TYPES,
  PRETTY_RESOURCE_TYPES,
  ResourceDeployStatus,
} from '../services/deploy-diff/preview-output.js'
import {
  DEPLOY_PLAN_DISABLED,
  DiffEntry,
  ProjectDeployResponse,
  ProjectDeployCancelledError,
  ProjectPlanStaleError,
  ProjectPlanDisabledError,
  ProjectPreviewNotSupportedError,
  ProjectPreviewResponse,
  ProjectSync,
} from '../rest/projects.js'
import { ConflictError, ValidationError } from '../rest/errors.js'
import { stripUnsupportedDeployFields } from '../services/deploy-diff/legacy-payload.js'
import { planChangeLines, planHasNoChanges, reducePlanForAgent } from '../services/deploy-diff/plan-summary.js'
import { formatWriteBackSkipped, formatWriteBackUpdated } from '../services/write-back/output.js'
import { applyWriteBack, hasWritableChanges, planWriteBack } from '../services/write-back/plan.js'
import type { CommandAlternative } from '../helpers/command-preview.js'
import type { Project } from '../constructs/project.js'
import { uploadSnapshots } from '../services/snapshot-service.js'
import { BrowserCheckBundle } from '../constructs/browser-check-bundle.js'
import { Runtime } from '../runtimes/index.js'
import { Bundler } from '../services/check-parser/bundler.js'

/**
 * The deploy payload fields that arrived with the preview endpoint, which a
 * deploy schema older than it rejects by name (`"sourceFile" is not allowed`).
 * Kept in step with `stripUnsupportedDeployFields`.
 */
const PREVIEW_ERA_FIELDS = ['sourceFile', 'codeBundleSha256', 'sha256']

/**
 * Whether the API refused the payload because of a field an older deploy
 * schema does not know: a 400 whose message names the field as not allowed.
 * Only such a refusal is worth repeating in the older form: any other 400,
 * including a bad value for one of these very fields, describes a problem
 * the older form would not fix, or would hide. A refusal whose body the
 * client recognises arrives as a {@link ValidationError}; one it does not
 * arrives as the raw HTTP error.
 */
function rejectsPreviewEraField (err: any): boolean {
  const status = err instanceof ValidationError ? 400 : err?.response?.status ?? err?.data?.statusCode
  if (status !== 400) {
    return false
  }
  const message = String(err?.data?.message ?? err?.response?.data?.message ?? err?.message ?? '')
  return message.includes('is not allowed') && PREVIEW_ERA_FIELDS.some(field => message.includes(field))
}

/**
 * The further choice a terminal gets when the plan shows a resource edited
 * outside the project and the code can take the edit: write the account's
 * current values into the code and deploy nothing, so the user reviews the
 * diff and deploys again rather than overwriting the edit. Only the
 * properties the write-back knows the construct's spelling of (a literal,
 * or a helper such as `Frequency.EVERY_5M`) can be written; everything
 * else is listed with its reason.
 */
function writeBackAlternatives (diff: DiffEntry[], project: Project, command: Deploy): CommandAlternative[] {
  if (!hasWritableChanges(diff, project)) {
    return []
  }
  return [{
    title: 'Update my code with the changes made in Checkly (deploys nothing)',
    run: async () => {
      const cwd = process.cwd()
      const writeBack = await planWriteBack({ diff, project, cwd })
      const skipped = writeBack.skipped.length > 0 ? formatWriteBackSkipped({ writeBack, project, cwd }) : undefined
      command.log()
      if (writeBack.applied.length === 0) {
        if (skipped !== undefined) {
          command.log(skipped)
        }
        command.log('Nothing in the code could be updated automatically, so nothing was changed.')
        command.log('Nothing was deployed.')
        return
      }
      try {
        await applyWriteBack(writeBack)
      } catch (err: any) {
        // What has to be edited by hand is true whether or not the write
        // went through, so it is still said.
        if (skipped !== undefined) {
          command.log(skipped)
        }
        // The error names the files already rewritten, if any.
        command.style.longError('Could not update your code.', err.message)
        command.log('Nothing was deployed.')
        command.exit(1)
      }
      // Reported once the files hold it, not as an intention; what could not
      // be written follows what was.
      command.log(formatWriteBackUpdated({ writeBack, project, cwd }))
      if (skipped !== undefined) {
        command.log(skipped)
      }
      command.log('Nothing was deployed. Review with `git diff`, then run `npx checkly deploy --plan` again.')
    },
  }]
}

export default class Deploy extends AuthCommand {
  static coreCommand = true
  static hidden = false
  static idempotent = true
  static description = 'Deploy your project to your Checkly account.'

  static flags = {
    'preview': Flags.boolean({
      char: 'p',
      description: 'Show a preview of the changes made by the deploy command. '
        + 'Add --plan to see what changes in each resource.',
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
    'schedule-on-deploy-threshold': autoOrWholeNumberFlag({
      description: 'Schedule no checks after the deploy if it would schedule more than this many. '
        + '"auto" leaves the threshold to Checkly, which also caps the number you can set.',
      default: 'auto',
    }),
    'schedule-on-deploy-min-frequency': autoOrWholeNumberFlag({
      description: 'After the deploy, schedule only the checks that run every this many minutes or less often; '
        + 'more frequent checks wait for their next scheduled run. Goes by the frequency Checkly resolves for each '
        + 'check, its defaults included. 0 schedules every check. "auto" leaves the minimum to Checkly, which also '
        + 'caps the number you can set.',
      default: 'auto',
    }),
    'preserve-resources': Flags.boolean({
      description: 'Keep resources removed from code (and their run history) in your Checkly account instead of deleting them.',
      default: false,
    }),
    'force': forceFlag(),
    'dry-run': dryRunFlag(),
    'plan': Flags.boolean({
      description: 'Ask Checkly for a plan first: what the deploy would change, property by property, compared '
        + 'with what is deployed. The deploy then applies that plan, leaves unchanged resources alone and '
        + 'refuses to run if your Checkly account changed in between.',
      default: false,
      allowNo: true,
    }),
    'plan-token': Flags.string({
      description: 'Deploy only if the plan still matches this token from an earlier run. '
        + 'Aborts if anything changed in your Checkly account since then. Requires --plan.',
    }),
    'prune-relations': Flags.boolean({
      description: 'Delete the alert channel subscriptions and private location assignments on this project\'s '
        + 'checks and groups that the project does not manage. Requires --plan.',
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
      // Named for what it is, the user's request: `plan` further down is the
      // plan Checkly answered with, which a run that asked may still not have.
      'plan': planRequested,
      'plan-token': requestedPlanToken,
      'prune-relations': pruneRelations,
      'cancel-in-progress-deployment': cancelInProgress,
      'schedule-on-deploy': scheduleOnDeploy,
      'schedule-on-deploy-threshold': scheduleThreshold,
      'schedule-on-deploy-min-frequency': scheduleMinFrequency,
      'preserve-resources': preserveResources,
      output: outputFlag,
      verbose,
      config: configFilename,
      'verify-runtime-dependencies': verifyRuntimeDependencies,
      'debug-bundle': debugBundle,
      'debug-bundle-output-file': debugBundleOutputFile,
    } = flags
    const output = outputFlag || verbose

    // Both are promises only a plan can keep: the token, that nothing is
    // deployed unless the account still is what was reviewed, and pruning,
    // that what gets deleted was listed first. Checked here rather than with
    // the flags' `dependsOn`, which a flag that has a default always satisfies.
    if (!planRequested) {
      const needsPlan = requestedPlanToken !== undefined
        ? '--plan-token'
        : pruneRelations ? '--prune-relations' : undefined
      if (needsPlan !== undefined) {
        this.style.longError(
          `${needsPlan} applies to a planned deploy only.`,
          `Re-run with --plan, or without ${needsPlan}.`,
        )
        this.exit(1)
      }
    }

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
    // deferred until the deploy has been confirmed: a preview describes the
    // code bundle and every snapshot by content hash, and a dry-run deploy
    // accepts a payload without keys, so finding out what a deploy would
    // change costs no uploads. `uploaded` tells `deployPayload` whether the
    // snapshots carry keys yet.
    let uploaded = false
    const uploadArtifacts = async () => {
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

      // The step is only announced when there is a snapshot to upload. Every
      // browser check gets its snapshot list either way, an empty one included.
      if (browserBundles.some(bundle => bundle.rawSnapshots?.length)) {
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
      } else {
        for (const bundle of browserBundles) {
          bundle.snapshots = []
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
    // prompt words it. The plan's own lines follow these. The scheduling
    // threshold is left out: few deploys reach it, and the deploy reports it
    // when one does.
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
    // `full` buys each changed resource's current state, which is what the
    // rendered construct diff (`--preview`, `--output`, the plan an interactive
    // run shows before asking) and the machine-readable envelope (`--dry-run`,
    // the `confirmation_required` an agent or CI run prints) show. Only a
    // forced deploy prints nothing of the kind, so only it skips paying for
    // the state.
    const detail = dryRun || preview || output || !force ? 'full' : 'changes'

    let plan: ProjectPreviewResponse | undefined
    // Set when the API has no preview endpoint, which also means it rejects the
    // payload fields that arrived with it.
    let previewNotSupported = false
    // Without --plan the deploy applies to whatever the account looks like
    // when it runs: no plan, no token, and nothing to render before the prompt.
    if (planRequested) {
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
        // An API that has plans switched off is not one that predates them: it
        // knows the payload fields that arrived with the preview endpoint, so
        // the payload is not stripped of them.
        const plansDisabled = err instanceof ProjectPlanDisabledError
        previewNotSupported = err instanceof ProjectPreviewNotSupportedError
        const previewSupported = !previewNotSupported && !plansDisabled

        // --prune-relations deletes data, and without a plan nothing can say
        // what: an API that predates the preview endpoint would not prune at all,
        // and an API that would prune cannot be asked what it is about to delete.
        // Both are refused rather than silently downgraded.
        if (pruneRelations) {
          this.style.longError(
            previewSupported
              ? 'Could not check which relations --prune-relations would delete, so nothing was deployed.'
              : plansDisabled
                ? 'Checkly has deploy plans switched off at the moment, so relations cannot be pruned.'
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
              : plansDisabled
                ? 'Checkly has deploy plans switched off at the moment; re-run without --plan-token.'
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
            : plansDisabled
              ? err.message
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
          'Re-run `checkly deploy --plan --preview` to see the current plan.',
        )
        this.exit(1)
      }
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

    // A planned run learns from the preview call whether the API has the
    // endpoint, and with it whether the deploy route knows the fields that
    // arrived with it. A run without a plan — one that did not ask for it, or
    // a preview that failed for a reason other than a missing endpoint — does not, so a
    // payload the route refuses because of one of those fields is sent once
    // more in the older form; the rest of the run then sends that form too.
    // If the older form is refused as well, the refusal of the payload the
    // user asked for is the one that surfaces; any other failure of the
    // second attempt is its own and keeps its own handling. The older form
    // blanks the stored content hashes, which the next planned deploy reports
    // as a change to every Playwright check suite and every check with
    // snapshots — once, and worth a warning once a deploy has gone out that
    // way.
    let sentLegacyPayload = false
    const deployOrRetryLegacy = async (
      options: Parameters<typeof api.projects.deploy>[1],
    ): Promise<{ data: ProjectDeployResponse }> => {
      try {
        return await api.projects.deploy(deployPayload(), options)
      } catch (err: any) {
        if (plan !== undefined || previewNotSupported || !rejectsPreviewEraField(err)) {
          throw err
        }
        previewNotSupported = true
        try {
          const result = await api.projects.deploy(deployPayload(), options)
          sentLegacyPayload = true
          return result
        } catch (retryErr: any) {
          if (retryErr instanceof ValidationError) {
            throw err
          }
          throw retryErr
        }
      }
    }

    // Without a plan, deletions are only visible in a dry-run deploy. It runs
    // before the uploads, like the preview: a run that is about to ask for
    // confirmation, or that only reports, must not leave a code bundle and
    // snapshots in storage for an answer that may be no. The dry run validates
    // the payload it is given, in which a code bundle it has not been handed a
    // key for is described by its path on disk and snapshots without a key are
    // left out, as it was before the preview endpoint existed. A storage key
    // the deploy route refuses is therefore caught by the deploy itself, after
    // the uploads, not by this dry run.
    let fallbackDiff: ProjectDeployResponse | undefined
    if (plan === undefined && (preview || dryRun || (!preserveResources && !force))) {
      this.style.actionStart('Verifying deployed state')
      try {
        const { data } = await deployOrRetryLegacy({
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

    // The plan as `--preview` prints it, which is also what a terminal sees
    // before it is asked. Without a plan, the dry run's findings are listed.
    const renderPlan = (planToken?: string): string => formatPreview({
      heading: { title: 'Deploy preview', projectName: project.name, accountName: account.name },
      diff: plan?.diff ?? fallbackDiff?.diff ?? [],
      project,
      verbose,
      pruneRelations,
      rendering: plan !== undefined ? { plan: plan.diff, local: projectPayload.resources } : undefined,
      planToken,
    })

    if (preview && !dryRun) {
      this.log(renderPlan(plan?.planToken))
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

    // A plan with nothing to write has nothing to approve, so nobody is asked:
    // a terminal, an agent and a forced run all read that there are no changes
    // and carry on. The deploy is still sent, pinned to the plan's token like
    // any other. It writes no resource, but it records the deployment, renews
    // the deployed state the next plan compares against (which is what clears
    // the mark of a resource edited outside code once the code agrees with
    // it), and schedules the checks unless told not to. --dry-run keeps its
    // envelope, which a script reads the same way whatever the plan holds.
    const nothingToApply = plan !== undefined && planHasNoChanges(plan.diff, summaryOptions)

    if (nothingToApply && !dryRun) {
      this.log(renderPlan())
    } else {
      // The one confirmation of the command: the plan is known by now, so the
      // prompt, the agent envelope and --dry-run all describe the deploy that is
      // about to run rather than a deploy nobody has seen. A terminal gets the
      // plan rendered as `--preview` prints it, with the options under it; the
      // plan lines are not repeated there since the overview names every
      // resource. No plan-token footer: this run pins the token itself.
      await this.confirmOrAbort({
        command: 'deploy',
        description: 'Deploy project to Checkly',
        changes: [...optionLines, ...planLines],
        ...plan !== undefined
          ? {
              terminal: {
                plan: renderPlan,
                changes: optionLines,
                alternatives: writeBackAlternatives(plan.diff, project, this),
              },
              question: 'Apply these changes?',
            }
          : {},
        // The token rides along in the echoed command, so the confirming run
        // deploys the plan that was shown here and refuses a different one.
        flags: plan !== undefined ? { ...flags, 'plan-token': plan.planToken } : flags,
        flagMetadata: metadata.flags,
        classification,
        ...plan !== undefined
          ? { preview: { planToken: plan.planToken, diff: reducePlanForAgent(plan.diff) } }
          : {},
      }, { force, dryRun })
    }

    await uploadArtifacts()

    const runDeploy = () => deployOrRetryLegacy({
      scheduleOnDeploy,
      scheduleOnDeployThreshold: scheduleThreshold === 'auto' ? undefined : scheduleThreshold,
      scheduleOnDeployMinFrequency: scheduleMinFrequency === 'auto' ? undefined : scheduleMinFrequency,
      preserveResources,
      pruneRelations,
      // Read when the deploy is sent, so that a run which planned again after
      // a stale plan is covered. Only a run that holds a plan asks the deploy
      // to apply one: without it the deploy writes every resource, as it did
      // before plans existed.
      plan: plan !== undefined,
      planToken: plan?.planToken,
      cancelInProgress,
      onProgress: progress => this.style.actionStatus(`${progress}% complete`),
      onStatus: message => this.style.actionStatus(message),
    })

    try {
      // "Deploying" right under "No changes" would read as a contradiction.
      this.style.actionStart(nothingToApply ? 'Recording the deployment' : 'Deploying project')
      let data: ProjectDeployResponse
      try {
        ({ data } = await runDeploy())
      } catch (err) {
        // A run that showed nobody a plan has nothing to protect: rather than
        // failing a pipeline because someone touched the account while the code
        // bundle was uploading, it plans again and deploys that. A pinned run,
        // or one a person confirmed, is refused instead — see the catch below.
        // A run without a plan sent no token, so it cannot be told its plan
        // went stale; the guard keeps it out of the re-plan regardless.
        if (!(err instanceof ProjectPlanStaleError) || !force || requestedPlanToken !== undefined || !planRequested) {
          throw err
        }
        this.style.actionStatus('Your Checkly account changed; checking again and deploying the current plan')
        plan = await api.projects.preview(deployPayload(), { detail, preserveResources, pruneRelations })
        ;({ data } = await runDeploy())
      }
      this.style.actionSuccess()
      if (sentLegacyPayload) {
        this.style.longWarning(
          'This Checkly API does not know the fields the preview endpoint added, so the deploy was sent without them.',
          'The next `checkly deploy --plan` reports every Playwright check suite and every check with snapshots as changed.',
        )
      }
      // Judged on what the deploy answered, not on the plan it started from: a
      // forced run that planned again after the account moved may have written
      // something after all.
      const wroteNothing = plan !== undefined && planHasNoChanges(data.diff, summaryOptions)
      if (output && !wroteNothing) {
        // The deploy response names every resource with its id; the plan the
        // deploy was confirmed against is where each one's deployed state is.
        // No heading: the success line that follows names the project and account.
        this.log(formatPreview({
          done: true,
          diff: data.diff,
          project,
          verbose,
          pruneRelations,
          rendering: plan !== undefined ? { plan: plan.diff, local: projectPayload.resources } : undefined,
        }))
      }
      await setTimeout(500)
      // The checks Checkly marked with whether it scheduled them; none from an
      // API that predates the marks.
      const markedChecks = data.diff.filter(entry => entry.scheduled !== undefined)
      if (wroteNothing) {
        // Scheduling is the one thing such a deploy visibly does, so it is said.
        // Without marks it is counted on what was sent and can be scheduled: a
        // testOnly check is in the project but not in the deploy, and a
        // heartbeat monitor waits for pings instead of running.
        const heartbeats = project.getHeartbeatLogicalIds()
        const scheduled = markedChecks.length > 0
          ? markedChecks.some(entry => entry.scheduled)
          : (data.scheduled ?? scheduleOnDeploy)
            && Object.keys(projectBundle.data.check).some(logicalId => !heartbeats.includes(logicalId))
        this.log(`Project "${project.name}" is up to date.${scheduled ? ' Checks were scheduled to run.' : ''}`)
      } else {
        this.log(`Successfully deployed project "${project.name}" to account "${account.name}".`)
      }
      // Checkly schedules none of a deploy's checks when there are more than
      // the threshold allows, which is worth a warning. Otherwise it may still
      // leave some out, such as the ones that already run often; a notice
      // lists those, kept short so that it does not push people into relaxing
      // the limits. A deploy that asked for no scheduling hears about neither.
      const notScheduled = scheduleOnDeploy
        ? markedChecks.filter(entry => entry.scheduled === false && entry.scheduleSkippedReason !== 'NOT_REQUESTED')
        : []
      if (scheduleOnDeploy && data.scheduled === false) {
        // Set apart from the line above, which ends without one.
        this.log()
        this.style.longWarning('Checks were not scheduled', [
          'This deploy would have scheduled more checks than the scheduling threshold allows.',
          '',
          'All checks will run at their next scheduled time.',
          '',
          'Helpful options:',
          '  --no-schedule-on-deploy',
          '    Disable automatic check scheduling after a deploy. Removes the warning.',
          '',
          '  --schedule-on-deploy-threshold=<number>',
          '    Change the threshold to a suitable number of checks.',
          '',
          '  --schedule-on-deploy-min-frequency=<number>',
          '    Only schedule checks that run less often than the specified frequency',
          '    (in minutes), reducing the number of scheduled checks.',
          '',
          '  For a full list of options, pass --help.',
        ].join('\n'))
      } else if (notScheduled.length > 0) {
        this.log()
        this.style.longInfo('Some checks were not scheduled', [
          'The checks will run at their next scheduled time.',
          '',
          'Not scheduled:',
          ...Object.entries(countBy(notScheduled, entry => entry.scheduleSkippedReason ?? 'UNKNOWN'))
            .map(([reason, count]) => `- ${describeNotScheduled(reason, count)}`),
        ].join('\n'))
      }

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
          this.log(formatPreview({
            heading: { title: 'Current plan', projectName: project.name, accountName: account.name },
            diff: err.diff,
            project,
            verbose,
            pruneRelations,
          }))
          this.style.longError(
            // A plan with nothing to apply was confirmed by nobody.
            nothingToApply
              ? 'Your Checkly account changed after the plan found no changes, so nothing was deployed.'
              : 'Your Checkly account changed while this deploy was being confirmed, so nothing was deployed.',
            'The plan above is the current one. Re-run `checkly deploy --plan` to review and deploy it.',
          )
        } else {
          // A refusal with no plan attached: the account moved for a reason the
          // error itself explains, and there is nothing to print above.
          this.style.longError(
            `${err.message} Nothing was deployed.`,
            'Re-run `checkly deploy --plan` to see the current plan and deploy it.',
          )
        }
      } else if (plan !== undefined && err instanceof ValidationError && err.data.code === DEPLOY_PLAN_DISABLED) {
        // The plan was made, and plans were switched off before the deploy
        // that applies it arrived. The refusal is worded for whoever sent a
        // token; this run pinned its own.
        this.style.longError(
          'Checkly switched deploy plans off while this deploy was being prepared, so nothing was deployed.',
          requestedPlanToken !== undefined || pruneRelations
            ? 'Re-run the command without --plan-token and --prune-relations. '
            + 'While plans are switched off it deploys without one.'
            : 'Re-run the command. While plans are switched off it deploys without one.',
        )
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
}

function countBy<T> (items: T[], key: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const item of items) {
    counts[key(item)] = (counts[key(item)] ?? 0) + 1
  }
  return counts
}

/** One line of the not-scheduled notice: how many checks a skip reason left out. */
function describeNotScheduled (reason: string, count: number): string {
  const checks = count === 1 ? '1 check' : `${count} checks`
  switch (reason) {
    case 'MIN_FREQUENCY':
      return `${checks} that ${count === 1 ? 'runs' : 'run'} more often than the minimum frequency allows`
    default:
      // A reason this CLI does not know yet, from a newer Checkly API: named
      // as the API reports it.
      return `${checks} for another reason (${reason})`
  }
}
