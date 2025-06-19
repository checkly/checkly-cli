import { BaseCommand } from './baseCommand'
import * as recast from 'recast'
import { getChecklyConfigFile } from '../services/checkly-config-loader'
import { loadPlaywrightConfig } from '../playwright/playwright-config-loader'
import path from 'path'
import { ux } from '@oclif/core'
import PlaywrightConfigTemplate from '../playwright/playwright-config-template'
import { addOrReplaceItem, findPropertyByName, reWriteChecklyConfigFile } from '../helpers/write-config-helpers'

export default class SyncPlaywright extends BaseCommand {
  static hidden = false
  static description = 'Copy Playwright config into the Checkly config file.'

  async run (): Promise<void> {
    if (this.fancy) {
      ux.action.start('Syncing Playwright config to the Checkly config file', undefined, { stdout: true })
    }

    const configFile = await getChecklyConfigFile()
    if (!configFile) {
      return this.handleError('Could not find a checkly config file')
    }
    const checklyAst = recast.parse(configFile.checklyConfig)

    const config = await loadPlaywrightConfig()
    if (!config) {
      return this.handleError('Could not find any playwright.config file.')
    }

    const checksAst = findPropertyByName(checklyAst, 'checks')
    if (!checksAst) {
      return this.handleError('Unable to automatically sync your config file. This can happen if your Checkly config is ' +
          'built using helper functions or other JS/TS features. You can still manually set Playwright config values in ' +
          'your Checkly config: https://www.checklyhq.com/docs/cli/constructs-reference/#project')
    }

    const pwtConfig = new PlaywrightConfigTemplate(config).getConfigTemplate()
    const pwtConfigAst = findPropertyByName(recast.parse(pwtConfig), 'playwrightConfig')
    addOrReplaceItem(checksAst.value, pwtConfigAst, 'playwrightConfig')

    const checklyConfigData = recast.print(checklyAst, { tabWidth: 2 }).code
    const dir = path.resolve(path.dirname(configFile.fileName))
    await reWriteChecklyConfigFile(checklyConfigData, configFile.fileName, dir)

    if (this.fancy) {
      ux.action.stop('✅ ')
    }
    this.log('Successfully updated Checkly config file')
    this.exit(0)
  }

  private handleError (message: string) {
    if (this.fancy) {
      ux.action.stop('❌')
    }
    this.log(message)
    this.exit(1)
  }
}
