import { PlaywrightCheck } from 'checkly/constructs'

const check1 = new PlaywrightCheck('check1', {
  name: 'Check',
  playwrightConfigPath: './playwright.config.ts',
  installCommand: 'npm ci',
})

const check2 = new PlaywrightCheck('check2', {
  name: 'Check',
  playwrightConfigPath: './playwright.config.ts',
  installCommand: 'pnpm i',
})
