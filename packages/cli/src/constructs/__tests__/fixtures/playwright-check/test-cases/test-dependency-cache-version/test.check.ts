import { PlaywrightCheck } from 'checkly/constructs'

const check = new PlaywrightCheck('check1', {
  name: 'Check',
  playwrightConfigPath: './playwright.config.ts',
})
