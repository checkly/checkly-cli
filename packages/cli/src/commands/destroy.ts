import { Flags } from '@oclif/core'
import * as api from '../rest/api'
import { loadChecklyConfig } from '../services/checkly-config-loader'
import { AuthCommand } from './authCommand'
import prompts from 'prompts'
import { splitConfigFilePath } from '../services/util'
import commonMessages from '../messages/common-messages'

export default class Destroy extends AuthCommand {
  static hidden = false
  static description = 'Destroy your project with all its related resources.'

  static flags = {
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
    const { flags } = await this.parse(Destroy)
    const { force, config: configFilename } = flags
    const { configDirectory, configFilenames } = splitConfigFilePath(configFilename)
    const { config: checklyConfig } = await loadChecklyConfig(configDirectory, configFilenames)
    const account = this.account
    if (!force) {
      const { projectName } = await prompts({
        name: 'projectName',
        type: 'text',
        message: `Are you sure you want to delete all resources in project "${checklyConfig.projectName}" for account "${account.name}"?\n  Please confirm by typing the project name "${checklyConfig.projectName}":`,
      })
      if (projectName !== checklyConfig.projectName) {
        this.log(`The entered project name "${projectName}" doesn't match the expected project name "${checklyConfig.projectName}".`)
        return
      }
    }
    try {
      await api.projects.deleteProject(checklyConfig.logicalId)
      this.log(`All resources associated with project "${checklyConfig.projectName}" have been successfully deleted.`)
    } catch (err: any) {
      if (err?.response?.status === 400) {
        throw new Error(`Failed to destroy your project: ${err.response.data?.message}`)
      } else {
        throw new Error(`Failed to destroy your project. ${err.message}`)
      }
    }
  }
}
