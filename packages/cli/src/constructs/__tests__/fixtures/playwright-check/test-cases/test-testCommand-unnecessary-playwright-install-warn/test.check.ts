import { PlaywrightCheck } from 'checkly/constructs'

const check = new PlaywrightCheck('check', {
  name: 'Check',
  playwrightConfigPath: './playwright.config.ts',
  testCommand: 'npx playwright install && npx playwright test',
})
