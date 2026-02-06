import { PlaywrightCheck } from 'checkly/constructs'

const check1 = new PlaywrightCheck('check1', {
  name: 'Check',
  playwrightConfigPath: './playwright.config.ts',
  testCommand: 'npx playwright test',
})

const check2 = new PlaywrightCheck('check2', {
  name: 'Check',
  playwrightConfigPath: './playwright.config.ts',
  testCommand: 'pnpm playwright test',
})
