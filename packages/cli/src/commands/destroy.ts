import prompts from 'prompts'
import { Flags } from '@oclif/core'
import * as api from '../rest/api'
import { loadChecklyConfig } from '../services/checkly-config-loader'
import { AuthCommand } from './authCommand'
import { splitConfigFilePath } from '../services/util'
import commonMessages from '../messages/common-messages'
import { forceFlag } from '../helpers/flags'

export default class Destroy extends AuthCommand {
  static hidden = false
  static destructive = true
  static description = 'Destroy your project with all its related resources.'

  static flags = {
    'force': forceFlag(),
    'config': Flags.string({
      char: 'c',
      description: commonMessages.configFile,
    }),
    'preserve-resources': Flags.boolean({
      description: 'Preserve all project resources (checks, groups, dashboards, etc.) when destroying the project. Resources become normal account-level resources.',
      default: false,
    }),
  }

  async run (): Promise<void> {
    const { flags } = await this.parse(Destroy)
    const {
      config: configFilename,
      'preserve-resources': preserveResources,
    } = flags
    const { configDirectory, configFilenames } = splitConfigFilePath(configFilename)
    const { config: checklyConfig } = await loadChecklyConfig(configDirectory, configFilenames)
    const account = this.account

    await this.confirmOrAbort({
      command: 'destroy',
      description: preserveResources
        ? 'Destroy project but preserve resources'
        : 'Destroy all project resources',
      changes: [
        preserveResources
          ? `Delete the project "${checklyConfig.projectName}" in account "${account.name}" but preserve all resources as normal account-level resources`
          : `PERMANENTLY delete ALL resources associated with the project "${checklyConfig.projectName}" in account "${account.name}"`,
      ],
      flags,
      classification: {
        readOnly: Destroy.readOnly,
        destructive: Destroy.destructive,
        idempotent: Destroy.idempotent,
      },
    }, {
      force: flags.force,
      interactiveConfirm: async () => {
        const { projectName } = await prompts({
          name: 'projectName',
          type: 'text',
          message: `Type the project name "${checklyConfig.projectName}" to confirm:`,
        })
        if (projectName === undefined) {
          return false
        }
        if (projectName !== checklyConfig.projectName) {
          this.log(`The entered project name "${projectName}" doesn't match the expected project name "${checklyConfig.projectName}".`)
          return false
        }
        return true
      },
    })

    try {
      await api.projects.deleteProject(checklyConfig.logicalId, { preserveResources })
      this.log(preserveResources
        ? `Project "${checklyConfig.projectName}" has been successfully deleted. All resources have been preserved as account-level resources.`
        : `All resources associated with project "${checklyConfig.projectName}" have been successfully deleted.`)
    } catch (err: any) {
      this.style.longError(`Your project could not be destroyed.`, err)
      this.exit(1)
    }
  }
}
