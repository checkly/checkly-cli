import { BaseCommand } from './baseCommand'
import * as recast from 'recast'
import playwrightConfigTemplate from '../playwright/playwright-template'
import { getChecklyConfigFile } from '../services/checkly-config-loader'
import { loadPlaywrightConfig } from '../playwright/playwright-config-loader'
import { parse } from '../services/handlebars-helpers'
import * as Handlebars from 'handlebars'
import fs from 'fs'
import path from 'path'
import { ux } from '@oclif/core'

export default class SyncPlaywright extends BaseCommand {
  static hidden = true
  static description = 'Sync playwright config'

  async run (): Promise<void> {
    ux.action.start('Sync playwright config with checkly config', undefined, { stdout: true })

    const config = await loadPlaywrightConfig()
    if (!config) {
      return this.handleError('Could not find any playwright.config file.')
    }

    Handlebars.registerHelper('parse', parse)
    const pwtConfig = Handlebars.compile(playwrightConfigTemplate)(config)
    const configFile = getChecklyConfigFile()
    if (!configFile) {
      return this.handleError('Could not find a checkly config file')
    }

    const checklyAst = recast.parse(configFile.checklyConfig)
    const checksAst = this.findPropertyByName(checklyAst, 'checks')
    if (!checksAst) {
      return this.handleError('Could not parse your checkly config file')
    }

    const browserCheckAst = this.findPropertyByName(checksAst.value, 'browserChecks')
    if (!browserCheckAst) {
      return this.handleError('Could not parse your checkly config file')
    }
    const pwtConfigAst = this.findPropertyByName(recast.parse(pwtConfig), 'playwrightConfig')
    this.addOrReplacePlaywrightConfig(browserCheckAst.value, pwtConfigAst)

    const checklyConfigData = recast.print(checklyAst, { tabWidth: 2 }).code
    const dir = path.resolve(path.dirname(configFile.fileName))
    this.reWriteChecklyConfigFile(checklyConfigData, configFile.fileName, dir)

    ux.action.stop('✅ ')
    this.log('Successfully sync')
    this.exit(0)
  }

  private handleError (message: string) {
    ux.action.stop('❌')
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
