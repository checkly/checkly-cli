import * as api from '../rest/api'
import config from '../services/config'
import prompts from 'prompts'
import { Flags, ux } from '@oclif/core'
import { AuthCommand } from './authCommand'
import { parseProject } from '../services/project-parser'
import { loadChecklyConfig } from '../services/checkly-config-loader'
import { runtimes } from '../rest/api'
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
import indentString from 'indent-string'
import { Construct } from '../constructs/construct'

// eslint-disable-next-line no-restricted-syntax
enum ResourceDeployStatus {
  UPDATE = 'UPDATE',
  CREATE = 'CREATE',
  DELETE = 'DELETE',
}

type PreviewData = {
  sortedUpdating: Array<{ resourceType: string, logicalId: string, construct: Construct }>,
  sortedCreating: Array<{ resourceType: string, logicalId: string, construct: Construct }>,
  sortedDeleting: Array<{ resourceType: string, logicalId: string }>,
  skipping: Array<{ resourceType: string, logicalId: string, construct: Construct }>,
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
  }

  async run (): Promise<void> {
    ux.action.start('Parsing your project', undefined, { stdout: true })
    const { flags } = await this.parse(Deploy)
    const {
      force,
      preview,
      'schedule-on-deploy': scheduleOnDeploy,
      output,
      config: configFilename,
    } = flags
    const { configDirectory, configFilenames } = splitConfigFilePath(configFilename)
    const {
      config: checklyConfig,
      constructs: checklyConfigConstructs,
    } = await loadChecklyConfig(configDirectory, configFilenames)
    const { data: availableRuntimes } = await runtimes.getAll()
    const project = await parseProject({
      directory: configDirectory,
      projectLogicalId: checklyConfig.logicalId,
      projectName: checklyConfig.projectName,
      repoUrl: checklyConfig.repoUrl,
      checkMatch: checklyConfig.checks?.checkMatch,
      browserCheckMatch: checklyConfig.checks?.browserChecks?.testMatch,
      ignoreDirectoriesMatch: checklyConfig.checks?.ignoreDirectoriesMatch,
      checkDefaults: checklyConfig.checks,
      browserCheckDefaults: checklyConfig.checks?.browserChecks,
      availableRuntimes: availableRuntimes.reduce((acc, runtime) => {
        acc[runtime.name] = runtime
        return acc
      }, <Record<string, Runtime>> {}),
      checklyConfigConstructs,
    })
    const repoInfo = getGitInformation(project.repoUrl)

    ux.action.stop()

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

    // Always show the pre-deploy summary, except when the user passes the --preview.
    if (!preview) {
      const { data: deployDryRunResponse } = await api.projects.deploy(
        { ...projectPayload, repoInfo },
        { dryRun: true, scheduleOnDeploy: false },
      )
      this.log(this.formatMiniPreview(deployDryRunResponse, project))
    }

    const { data: account } = await api.accounts.get(config.getAccountId())

    if (!force && !preview) {
      const { confirm } = await prompts({
        name: 'confirm',
        type: 'confirm',
        message: `You are about to deploy your project "${project.name}" to account "${account.name}". Do you want to continue?`,
      })
      if (!confirm) {
        this.log('not deploying')
        return
      }
    }

    try {
      const { data: deployResponse } = await api.projects.deploy(
        { ...projectPayload, repoInfo },
        { dryRun: preview, scheduleOnDeploy },
      )
      if (preview || output) {
        this.log(this.formatPreview(deployResponse, project))
      }
      if (!preview) {
        await ux.wait(500)
        this.log(`Successfully deployed project "${project.name}" to account "${account.name}".`)

        // Print the ping URL for heartbeat checks.
        const heartbeatLogicalIds = project.getHeartbeatLogicalIds()
        const heartbeatCheckIds = deployResponse.diff.filter((check) => heartbeatLogicalIds.includes(check.logicalId))
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
    const preview = this.compilePreviewData(previewData, project)
    if (!preview.sortedCreating.length && !preview.sortedDeleting.length &&
      !preview.sortedUpdating.length && !preview.skipping.length) {
      return '\nNo changes were detected. More information on how to set up a Checkly CLI project is available at https://checklyhq.com/docs/cli/.\n'
    }

    const output = []

    if (preview.sortedCreating.filter(({ construct }) => Boolean(construct)).length) {
      output.push(chalk.green(`Creating (${preview.sortedCreating.length}):`))
      for (const { logicalId, construct } of preview.sortedCreating) {
        output.push(indentString(`${construct.constructor.name}: ${logicalId}`))
      }
      output.push('')
    }
    if (preview.sortedDeleting.length) {
      output.push(chalk.red(`Deleting (${preview.sortedCreating.length}):`))
      const prettyResourceTypes: Record<string, string> = {
        [Check.__checklyType]: 'Check',
        [AlertChannel.__checklyType]: 'AlertChannel',
        [CheckGroup.__checklyType]: 'CheckGroup',
        [MaintenanceWindow.__checklyType]: 'MaintenanceWindow',
        [PrivateLocation.__checklyType]: 'PrivateLocation',
        [Dashboard.__checklyType]: 'Dashboard',
      }
      for (const { resourceType, logicalId } of preview.sortedDeleting) {
        output.push(indentString(`${prettyResourceTypes[resourceType] ?? resourceType}: ${logicalId}`))
      }
      output.push('')
    }
    if (preview.sortedUpdating.length) {
      output.push(chalk.magenta(`Updating or leaving unchanged (${preview.sortedUpdating.length}):`))
      for (const { logicalId, construct } of preview.sortedUpdating) {
        output.push(indentString(`${construct.constructor.name}: ${logicalId}`))
      }
      output.push('')
    }
    if (preview.skipping.length) {
      output.push(chalk.grey(`Skipping because of testOnly (${preview.skipping.length}):`))
      for (const { logicalId, construct } of preview.skipping) {
        output.push(indentString(`${construct.constructor.name}: ${logicalId}`))
      }
      output.push('')
    }
    return output.join('\n')
  }

  private compilePreviewData (previewData: ProjectDeployResponse, project: Project): PreviewData {
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

    return { sortedUpdating, sortedCreating, sortedDeleting, skipping }
  }

  private formatMiniPreview (previewData: ProjectDeployResponse, project: Project): string {
    const preview = this.compilePreviewData(previewData, project)
    const output = []
    output.push(chalk.bold('\nDeploy preview:\n'))

    output.push(indentString(`- ${chalk.green(preview.sortedCreating.length + ' to create')}, ` +
      `${chalk.red(preview.sortedDeleting.length + ' to delete')}`))
    output.push(indentString('\nFor a full preview, run: npx checkly deploy --preview\n'))

    return output.join('\n')
  }
}
