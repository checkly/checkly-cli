import * as api from '../rest/api'
import config from '../services/config'
import { prompt } from 'inquirer'
import { Flags } from '@oclif/core'
import { AuthCommand } from './authCommand'
import { parseProject } from '../services/project-parser'
import { loadChecklyConfig } from '../services/checkly-config-loader'
import { runtimes } from '../rest/api'
import type { Runtime } from '../rest/runtimes'

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
  }

  async run (): Promise<void> {
    const { flags } = await this.parse(Deploy)
    const { force, preview, output } = flags
    const cwd = process.cwd()
    const { config: checklyConfig, constructs: checklyConfigConstructs } = await loadChecklyConfig(cwd)
    const { data: avilableRuntimes } = await runtimes.getAll()
    const project = await parseProject({
      directory: cwd,
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
      const projectPayload = project.synthesize()

      // TODO: refactor Check construct to handle internal attributes properly
      projectPayload.checks = Object.keys(projectPayload.checks).reduce((acc, checkLogicalId) => {
        const check = projectPayload.checks[checkLogicalId]
        delete check.__checkFilePath
        delete check.sourceFile
        acc = {
          ...acc,
          [checkLogicalId]: check,
        }
        return acc
      }, {})

      const { data } = await api.projects.deploy(projectPayload, { dryRun: preview })
      if (preview || output) {
        this.log(data)
      }
      if (!preview) {
        this.log(`Successfully deployed project "${project.name}" to account "${account.name}".`)
      }
    } catch (err: any) {
      if (err?.response?.status === 400) {
        throw new Error(`Failed to deploy the project due to a missing field. ${err.message}`)
      } else {
        throw new Error(`Failed to deploy the project. ${err.message}`)
      }
    }
  }
}
