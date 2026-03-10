import { PlaywrightCheck } from 'checkly/constructs'

const check = new PlaywrightCheck('my-check', {
  name: 'Check',
  playwrightConfigPath: './playwright.config.ts',
})
