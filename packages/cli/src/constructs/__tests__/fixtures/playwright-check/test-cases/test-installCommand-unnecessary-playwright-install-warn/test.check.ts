import { PlaywrightCheck } from 'checkly/constructs'

const check = new PlaywrightCheck('check', {
  name: 'Check',
  playwrightConfigPath: './playwright.config.ts',
  installCommand: 'npm ci && npx playwright install chromium',
})
