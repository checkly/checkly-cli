import { Flags } from '@oclif/core'
import * as api from '../rest/api'
import { loadChecklyConfig } from '../services/checkly-config-loader'
import { AuthCommand } from './authCommand'
import { prompt } from 'inquirer'
import config from '../services/config'
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
    const { data: account } = await api.accounts.get(config.getAccountId())
    if (!force) {
      const { projectName } = await prompt([{
        name: 'projectName',
        type: 'test',
        message: `Are you sure you want to delete all resources in project "${checklyConfig.projectName}" for account "${account.name}"?\n  Please confirm by typing the project name "${checklyConfig.projectName}":`,
      }])
      if (projectName !== checklyConfig.projectName) {
        this.log(`The entered project name "${projectName}" doesn't match the expected project name "${checklyConfig.projectName}".`)
        return
      }
    }
    await api.projects.deleteProject(checklyConfig.logicalId)
    this.log(`All resources associated with project "${checklyConfig.projectName}" have been successfully deleted.`)
  }
}
