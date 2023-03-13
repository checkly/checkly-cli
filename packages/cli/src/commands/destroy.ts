import * as api from '../rest/api'
import { loadChecklyConfig } from '../services/checkly-config-loader'
import { AuthCommand } from './authCommand'
import { prompt } from 'inquirer'
import config from '../services/config'

export default class Destroy extends AuthCommand {
  static hidden = false
  static description = 'Destroy your project'

  async run (): Promise<void> {
    const cwd = process.cwd()
    const { config: checklyConfig } = await loadChecklyConfig(cwd)
    const { data: account } = await api.accounts.get(config.getAccountId())
    const { projectName } = await prompt([{
      name: 'projectName',
      type: 'test',
      message: `Are you sure you want to delete all resources in project "${checklyConfig.projectName}" for account "${account.name}"?\n  Please confirm by typing the project name "${checklyConfig.projectName}":`,
    }])
    if (projectName !== checklyConfig.projectName) {
      this.log(`The entered project name "${projectName}" doesn't match the expected project name "${checklyConfig.projectName}".`)
      return
    }
    await api.projects.deleteProject(checklyConfig.logicalId)
    this.log(`All resources associated with project "${checklyConfig.projectName}" have been successfully deleted.`)
  }
}
