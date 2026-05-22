import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PlaywrightCheck } from 'checkly/constructs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

new PlaywrightCheck('playwright-check-suite', {
  name: 'Playwright Check Suite',
  playwrightConfigPath: './playwright.config.ts',
  include: [path.join(__dirname, 'fixtures', '**')],
})
