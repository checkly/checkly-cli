import { setTimeout } from 'node:timers/promises'
import * as fs from 'fs/promises'
import * as api from '../rest/api'
import config from '../services/config'
import prompts from 'prompts'
import { Flags, ux } from '@oclif/core'
import { AuthCommand } from './authCommand'
import { parseProject } from '../services/project-parser'
import { loadChecklyConfig } from '../services/checkly-config-loader'
import type { Runtime } from '../rest/runtimes'
import {
  Check, AlertChannelSubscription, AlertChannel, CheckGroup, Dashboard,
  MaintenanceWindow, PrivateLocation, PrivateLocationCheckAssignment, PrivateLocationGroupAssignment,
  Project, ProjectData, BrowserCheck,
} from '../constructs'
import chalk from 'chalk'
import { splitConfigFilePath, getGitInformation } from '../services/util'
import commonMessages from '../messages/common-messages'
import { ProjectDeployResponse } from '../rest/projects'
import { uploadSnapshots } from '../services/snapshot-service'

// eslint-disable-next-line no-restricted-syntax
enum ResourceDeployStatus {
  UPDATE = 'UPDATE',
  CREATE = 'CREATE',
  DELETE = 'DELETE',
}

export default class Deploy extends AuthCommand {
  static coreCommand = true
  static hidden = false
  static description = 'Deploy your project to your Checkly account.'

  static flags = {
    preview: Flags.boolean({
      char: 'p',
      description: 'Show a preview of the changes made by the deploy command.',
      default: false,
    }),
    output: Flags.boolean({
      char: 'o',
      description: 'Shows the changes made after the deploy command.',
      default: false,
    }),
    'schedule-on-deploy': Flags.boolean({
      description: 'Enables automatic check scheduling after a deploy.',
      default: true,
      allowNo: true,
    }),
    force: Flags.boolean({
      char: 'f',
      description: commonMessages.forceMode,
      default: false,
    }),
    config: Flags.string({
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
    playwrightConfig: Flags.string({
      char: 'p',
      description: 'File path to playwright config file',
      allowNo: true,
    }),
  }

  async run (): Promise<void> {
    if (this.fancy) {
      ux.action.start('Parsing your project', undefined, { stdout: true })
    }
    const { flags } = await this.parse(Deploy)
    const {
      force,
      preview,
      'schedule-on-deploy': scheduleOnDeploy,
      output,
      config: configFilename,
      'verify-runtime-dependencies': verifyRuntimeDependencies,
      'debug-bundle': debugBundle,
      'debug-bundle-output-file': debugBundleOutputFile,
      playwrightConfig,
    } = flags
    const { configDirectory, configFilenames } = splitConfigFilePath(configFilename)
    const {
      config: checklyConfig,
      constructs: checklyConfigConstructs,
    } = await loadChecklyConfig(configDirectory, configFilenames)
    const { data: account } = await api.accounts.get(config.getAccountId())
    const { data: avilableRuntimes } = await api.runtimes.getAll()
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
      availableRuntimes: avilableRuntimes.reduce((acc, runtime) => {
        acc[runtime.name] = runtime
        return acc
      }, <Record<string, Runtime>> {}),
      defaultRuntimeId: account.runtimeId,
      verifyRuntimeDependencies,
      checklyConfigConstructs,
      playwrightConfig,
    })
    const repoInfo = getGitInformation(project.repoUrl)

    if (this.fancy) {
      ux.action.stop()
    }

    if (!preview) {
      for (const check of Object.values(project.data.check)) {
        if (!(check instanceof BrowserCheck)) {
          continue
        }
        check.snapshots = await uploadSnapshots(check.rawSnapshots)
      }
    }

    const projectPayload = project.synthesize(false)
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

    if (!force && !preview) {
      const { confirm } = await prompts({
        name: 'confirm',
        type: 'confirm',
        message: `You are about to deploy your project "${project.name}" to account "${account.name}". Do you want to continue?`,
      })
      if (!confirm) {
        return
      }
    }

    try {
      const { data } = await api.projects.deploy({ ...projectPayload, repoInfo }, { dryRun: preview, scheduleOnDeploy })
      if (preview || output) {
        this.log(this.formatPreview(data, project))
      }
      if (!preview) {
        await setTimeout(500)
        this.log(`Successfully deployed project "${project.name}" to account "${account.name}".`)

        // Print the ping URL for heartbeat checks.
        const heartbeatLogicalIds = project.getHeartbeatLogicalIds()
        const heartbeatCheckIds = data.diff.filter((check) => heartbeatLogicalIds.includes(check.logicalId))
          .map(check => check?.physicalId)

        heartbeatCheckIds.forEach(async (id) => {
          const { data: { pingUrl, name } } = await api.heartbeatCheck.get(id as string)
          this.log(`Ping URL of heartbeat check ${chalk.green(name)} is ${chalk.italic.underline.blue(pingUrl)}.`)
        })
      }
    } catch (err: any) {
      if (err?.response?.status === 400) {
        throw new Error(`Failed to deploy your project due to wrong configuration. ${err.response.data?.message}`)
      } else {
        throw new Error(`Failed to deploy your project. ${err.message}`)
      }
    }
  }

  private formatPreview (previewData: ProjectDeployResponse, project: Project): string {
    // Current format of the data is: { checks: { logical-id-1: 'UPDATE' }, groups: { another-logical-id: 'CREATE' } }
    // We convert it into update: [{ logicalId, resourceType, construct }, ...], create: [], delete: []
    // This makes it easier to display.
    const updating = []
    const creating = []
    const deleting: Array<{ resourceType: string, logicalId: string }> = []
    for (const change of previewData?.diff ?? []) {
      const { type, logicalId, action } = change
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
        updating.push({ resourceType: type, logicalId, construct })
      } else if (action === ResourceDeployStatus.CREATE) {
        creating.push({ resourceType: type, logicalId, construct })
      } else if (action === ResourceDeployStatus.DELETE) {
        // Since the resource is being deleted, the construct isn't in the project.
        deleting.push({ resourceType: type, logicalId })
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
      .filter((skip) =>
        !deleting.find(
          deletion => deletion.logicalId === skip.logicalId && deletion.resourceType === skip.resourceType,
        ),
      )

    // Having some order will make the output easier to read.
    const compareEntries = (a: any, b: any) =>
      a.resourceType.localeCompare(b.resourceType) ||
      a.logicalId.localeCompare(b.logicalId)

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

    if (!sortedCreating.length && !sortedDeleting.length && !sortedUpdating.length && !skipping.length) {
      return '\nNo checks were detected. More information on how to set up a Checkly CLI project is available at https://checklyhq.com/docs/cli/.\n'
    }

    const output = []

    if (sortedCreating.filter(({ construct }) => Boolean(construct)).length) {
      output.push(chalk.bold.green('Create:'))
      for (const { logicalId, construct } of sortedCreating) {
        output.push(`    ${construct.constructor.name}: ${logicalId}`)
      }
      output.push('')
    }
    if (sortedDeleting.length) {
      output.push(chalk.bold.red('Delete:'))
      const prettyResourceTypes: Record<string, string> = {
        [Check.__checklyType]: 'Check',
        [AlertChannel.__checklyType]: 'AlertChannel',
        [CheckGroup.__checklyType]: 'CheckGroup',
        [MaintenanceWindow.__checklyType]: 'MaintenanceWindow',
        [PrivateLocation.__checklyType]: 'PrivateLocation',
        [Dashboard.__checklyType]: 'Dashboard',
      }
      for (const { resourceType, logicalId } of sortedDeleting) {
        output.push(`    ${prettyResourceTypes[resourceType] ?? resourceType}: ${logicalId}`)
      }
      output.push('')
    }
    if (sortedUpdating.length) {
      output.push(chalk.bold.magenta('Update and Unchanged:'))
      for (const { logicalId, construct } of sortedUpdating) {
        output.push(`    ${construct.constructor.name}: ${logicalId}`)
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
