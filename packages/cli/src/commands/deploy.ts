import * as api from '../rest/api'
import config from '../services/config'
import * as prompts from 'prompts'
import { Flags, ux } from '@oclif/core'
import { AuthCommand } from './authCommand'
import { parseProject } from '../services/project-parser'
import { loadChecklyConfig } from '../services/checkly-config-loader'
import { runtimes } from '../rest/api'
import type { Runtime } from '../rest/runtimes'
import {
  Check, AlertChannelSubscription, AlertChannel, CheckGroup,
  MaintenanceWindow, PrivateLocation, PrivateLocationAssignment, PrivateLocationGroupAssignment,
  Project, ProjectData,
} from '../constructs'
import * as chalk from 'chalk'
import { splitConfigFilePath } from '../services/util'
import commonMessages from '../messages/common-messages'
import { ProjectDeployResponse } from '../rest/projects'

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
    const { force, preview, output, config: configFilename } = flags
    const { configDirectory, configFilenames } = splitConfigFilePath(configFilename)
    const {
      config: checklyConfig,
      constructs: checklyConfigConstructs,
    } = await loadChecklyConfig(configDirectory, configFilenames)
    const { data: avilableRuntimes } = await runtimes.getAll()
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
      availableRuntimes: avilableRuntimes.reduce((acc, runtime) => {
        acc[runtime.name] = runtime
        return acc
      }, <Record<string, Runtime>> {}),
      checklyConfigConstructs,
    })
    ux.action.stop()
    const { data: account } = await api.accounts.get(config.getAccountId())

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
      const projectPayload = project.synthesize(false)
      const { data } = await api.projects.deploy(projectPayload, { dryRun: preview })
      if (preview || output) {
        this.log(this.formatPreview(data, project))
      }
      if (!preview) {
        await ux.wait(500)
        this.log(`Successfully deployed project "${project.name}" to account "${account.name}".`)
      }
    } catch (err: any) {
      if (err?.response?.status === 400) {
        throw new Error(`Failed to deploy your project due to a missing field. ${err.response.data?.message}`)
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
    const deleting = []
    for (const change of previewData?.diff ?? []) {
      const { type, logicalId, action } = change
      if ([
        AlertChannelSubscription.__checklyType,
        PrivateLocationAssignment.__checklyType,
        PrivateLocationGroupAssignment.__checklyType,
      ].some(t => t === type)) {
        // Don't report changes to alert channel subscriptions or private location assignments.
        // User's don't create these directly, so it's more intuitive to consider it as part of the check.
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

    if (!creating.length && !deleting.length && !updating.length) {
      return '\nNo checks were detected. More information on how to set up a Checkly CLI project is available at https://checklyhq.com/docs/cli/.\n'
    }

    // Having some order will make the output easier to read.
    const compareEntries = (a: any, b: any) =>
      a.resourceType.localeCompare(b.resourceType) ||
      a.logicalId.localeCompare(b.logicalId)
    updating.sort(compareEntries)
    creating.sort(compareEntries)
    deleting.sort(compareEntries)

    const output = []
    if (creating.length) {
      output.push(chalk.bold.green('Create:'))
      for (const { logicalId, construct } of creating) {
        // continue if the resource was created by the backend, like a non member private-location
        if (!construct) {
          continue
        }
        output.push(`    ${construct.constructor.name}: ${logicalId}`)
      }
      output.push('')
    }
    if (deleting.length) {
      output.push(chalk.bold.red('Delete:'))
      const prettyResourceTypes: Record<string, string> = {
        [Check.__checklyType]: 'Check',
        [AlertChannel.__checklyType]: 'AlertChannel',
        [CheckGroup.__checklyType]: 'CheckGroup',
        [MaintenanceWindow.__checklyType]: 'MaintenanceWindow',
        [PrivateLocation.__checklyType]: 'PrivateLocation',
      }
      for (const { resourceType, logicalId } of deleting) {
        output.push(`    ${prettyResourceTypes[resourceType] ?? resourceType}: ${logicalId}`)
      }
      output.push('')
    }
    if (updating.length) {
      output.push(chalk.bold.magenta('Update and Unchanged:'))
      for (const { logicalId, construct } of updating) {
        output.push(`    ${construct.constructor.name}: ${logicalId}`)
      }
      output.push('')
    }
    return output.join('\n')
  }
}
