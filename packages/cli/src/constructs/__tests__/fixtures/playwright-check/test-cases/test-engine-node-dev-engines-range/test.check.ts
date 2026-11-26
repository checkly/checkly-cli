import { PlaywrightCheck } from 'checkly/constructs'
new PlaywrightCheck('sample-1', {
  name: 'Sample',
  playwrightConfigPath: './playwright.config.ts',
})
