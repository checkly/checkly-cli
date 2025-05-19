import { BaseCommand } from './baseCommand'
import * as recast from 'recast'
import { getChecklyConfigFile } from '../services/checkly-config-loader'
import { loadPlaywrightConfig } from '../playwright/playwright-config-loader'
import fs from 'fs'
import path from 'path'
import { ux } from '@oclif/core'
import PlaywrightConfigTemplate from '../playwright/playwright-config-template'

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

    const checksAst = this.findPropertyByName(checklyAst, 'checks')
    if (!checksAst) {
      return this.handleError('Unable to automatically sync your config file. This can happen if your Checkly config is ' +
          'built using helper functions or other JS/TS features. You can still manually set Playwright config values in ' +
          'your Checkly config: https://www.checklyhq.com/docs/cli/constructs-reference/#project')
    }

    const pwtConfig = new PlaywrightConfigTemplate(config).getConfigTemplate()
    const pwtConfigAst = this.findPropertyByName(recast.parse(pwtConfig), 'playwrightConfig')
    this.addOrReplacePlaywrightConfig(checksAst.value, pwtConfigAst)

    const checklyConfigData = recast.print(checklyAst, { tabWidth: 2 }).code
    const dir = path.resolve(path.dirname(configFile.fileName))
    this.reWriteChecklyConfigFile(checklyConfigData, configFile.fileName, dir)

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

  private findPropertyByName (ast: any, name: string): recast.types.namedTypes.Property | undefined {
    let node
    recast.visit(ast, {
      visitProperty (path: any) {
        if (path.node.key.name === name) {
          node = path.node
        }
        return false
      },
    })
    return node
  }

  private addOrReplacePlaywrightConfig (ast: any, node: any) {
    const playWrightConfig = this.findPropertyByName(ast, 'playwrightConfig')
    if (playWrightConfig) {
      playWrightConfig.value = node.value
    } else {
      ast.properties.push(node)
    }
  }

  private reWriteChecklyConfigFile (data: string, fileName: string, dir: string) {
    fs.writeFileSync(path.join(dir, fileName), data)
  }
}
