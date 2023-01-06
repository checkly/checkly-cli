import * as api from '../rest/api'
import { prompt } from 'inquirer'
import { Command, Flags } from '@oclif/core'
import { parseProject } from '../services/project-parser'
import { loadChecklyConfig } from '../services/checkly-config-loader'
import { runtimes } from '../rest/api'
import type { Runtime } from '../rest/runtimes'

export default class Deploy extends Command {
  static description = 'Deploy your changes'

  static flags = {
    preview: Flags.boolean({
      char: 'p',
      description: 'Show state preview',
      default: false,
    }),
    force: Flags.boolean({
      char: 'f',
      description: 'force mode',
      default: false,
    }),
  }

  static auth = true

  async run (): Promise<void> {
    const { flags } = await this.parse(Deploy)
    const { force, preview } = flags
    const cwd = process.cwd()
    const checklyConfig = await loadChecklyConfig(cwd)
    const { data: avilableRuntimes } = await runtimes.getAll()
    const project = await parseProject({
      directory: cwd,
      projectLogicalId: checklyConfig.logicalId,
      projectName: checklyConfig.projectName,
      repoUrl: checklyConfig.repoUrl,
      checkMatch: checklyConfig.checks?.checkMatch,
      browserCheckMatch: checklyConfig.checks?.browserChecks?.checkMatch,
      ignoreDirectoriesMatch: checklyConfig.checks?.ignoreDirectoriesMatch,
      checkDefaults: checklyConfig.checks,
      browserCheckDefaults: checklyConfig.checks?.browserChecks,
      runtimeId: checklyConfig.checks?.runtimeId,
      availableRuntimes: avilableRuntimes.reduce((acc, runtime) => {
        acc[runtime.name] = runtime
        return acc
      }, <Record<string, Runtime>> {}),
    })

    if (!force) {
      const { confirm } = await prompt([{
        name: 'confirm',
        type: 'confirm',
        message: 'You are about to deploy your project. Do you want to continue?',
      }])
      if (!confirm) {
        return
      }
    }

    try {
      await api.projects.deploy(project.synthesize(), { dryRun: preview })
    } catch (err: any) {
      if (err?.response?.status === 400) {
        console.error(`Failed to deploy the project due to a missing field. ${err.response.data.message}`)
      }
      throw err
    }
  }
}
