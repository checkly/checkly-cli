import { Engine, PlaywrightCheck } from 'checkly/constructs'

new PlaywrightCheck('suite', {
  name: process.env.SUITE_NAME ?? 'Suite',
  playwrightConfigPath: './playwright.config.ts',
  pwProjects: 'chromium',
  engine: Engine.node('22'),
  frequency: 10,
  locations: ['us-east-1'],
})
