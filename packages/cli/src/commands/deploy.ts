import * as api from '../rest/api'
import config from '../services/config'
import { prompt } from 'inquirer'
import { Flags } from '@oclif/core'
import { AuthCommand } from './authCommand'
import { parseProject } from '../services/project-parser'
import { loadChecklyConfig } from '../services/checkly-config-loader'
import { runtimes } from '../rest/api'
import type { Runtime } from '../rest/runtimes'
import { AlertChannelSubscription, CheckGroup, Project, ProjectData } from '../constructs'
import * as chalk from 'chalk'
import { Check } from '../constructs/check'
import { AlertChannel } from '../constructs/alert-channel'
import { splitConfigFilePath } from '../services/util'

// eslint-disable-next-line no-restricted-syntax
enum ResourceDeployStatus {
  UPDATE = 'UPDATE',
  CREATE = 'CREATE',
  DELETE = 'DELETE',
}

export default class Deploy extends AuthCommand {
  static hidden = false
  static description = 'Deploy your changes'

  static flags = {
    preview: Flags.boolean({
      char: 'p',
      description: 'Show state preview',
      default: false,
    }),
    output: Flags.boolean({
      char: 'o',
      description: 'Show output',
      default: false,
    }),
    force: Flags.boolean({
      char: 'f',
      description: 'force mode',
      default: false,
    }),
    config: Flags.string({
      char: 'c',
      description: 'The Checkly CLI config filename.',
    }),
  }

  async run (): Promise<void> {
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

    const { data: account } = await api.accounts.get(config.getAccountId())

    if (!force && !preview) {
      const { confirm } = await prompt([{
        name: 'confirm',
        type: 'confirm',
        message: `You are about to deploy your project "${project.name}" to account "${account.name}". Do you want to continue?`,
      }])
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
        this.log(`Successfully deployed project "${project.name}" to account "${account.name}".`)
      }
    } catch (err: any) {
      if (err?.response?.status === 400) {
        throw new Error(`Failed to deploy the project due to a missing field. ${err.response.data?.message}`)
      } else {
        throw new Error(`Failed to deploy the project. ${err.message}`)
      }
    }
  }

  private formatPreview (previewData: any, project: Project): string {
    // Current format of the data is: { checks: { logical-id-1: 'UPDATE' }, groups: { another-logical-id: 'CREATE' } }
    // We convert it into update: [{ logicalId, resourceType, construct }, ...], create: [], delete: []
    // This makes it easier to display.
    const updating = []
    const creating = []
    const deleting = []
    for (const [resourceType, resourceStatuses] of Object.entries(previewData?.diff ?? {})) {
      if (resourceType === AlertChannelSubscription.__checklyType) {
        // Don't report changes to alert channel subscriptions.
        // User's don't create these directly, so it's more intuitive to consider it as part of the check.
        continue
      }
      for (const [logicalId, resourceStatus] of Object.entries(resourceStatuses ?? {})) {
        if (resourceStatus === ResourceDeployStatus.UPDATE) {
          const construct = project.data[resourceType as keyof ProjectData][logicalId]
          updating.push({ resourceType, logicalId, construct })
        } else if (resourceStatus === ResourceDeployStatus.CREATE) {
          const construct = project.data[resourceType as keyof ProjectData][logicalId]
          creating.push({ resourceType, logicalId, construct })
        } else if (resourceStatus === ResourceDeployStatus.DELETE) {
          // Since the resource is being deleted, the construct isn't in the project.
          deleting.push({ resourceType, logicalId })
        }
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
