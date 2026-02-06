import { CheckGroupV2, PlaywrightCheck } from 'checkly/constructs'

const group = new CheckGroupV2('group', {
  name: 'foo',
})

const check = new PlaywrightCheck('check', {
  name: 'Check',
  groupName: 'foo',
  group,
  playwrightConfigPath: './playwright.config.ts',
})
