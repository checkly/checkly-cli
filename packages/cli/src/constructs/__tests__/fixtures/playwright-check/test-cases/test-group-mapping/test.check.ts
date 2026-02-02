import { CheckGroupV2, PlaywrightCheck } from 'checkly/constructs'

const group = new CheckGroupV2('group', {
  name: 'Group',
})

const check = new PlaywrightCheck('check', {
  name: 'Check',
  group,
  playwrightConfigPath: './playwright.config.ts',
})
