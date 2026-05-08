import path from 'node:path'

import { Command, Flags } from '@oclif/core'

import { PlaywrightConfig } from '../../services/playwright-config.js'
import { Session } from '../../constructs/project.js'
import { Parser } from '../../services/check-parser/parser.js'

export default class ParsePlaywrightConfigCommand extends Command {
  static hidden = true
  static description = 'Parses and outputs relevant details of a Playwright configuration file.'

  static flags = {
    file: Flags.string({
      env: 'CHECKLY_PLAYWRIGHT_CONFIG_FILE',
      default: path.join(process.cwd(), 'playwright.config.ts'),
    }),
  }

  async run (): Promise<void> {
    const { flags } = await this.parse(ParsePlaywrightConfigCommand)
    const {
      file: playwrightConfigFile,
    } = flags

    const playwrightConfig = new PlaywrightConfig(
      playwrightConfigFile,
      await Session.loadFile(playwrightConfigFile),
    )

    const parser = new Parser({
      restricted: false,
    })
    const output = await parser.getFilesAndDependencies(playwrightConfig)

    // eslint-disable-next-line no-console
    console.log(JSON.stringify(output, null, 2))
  }
}
