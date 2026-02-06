import { CheckGroupV2, PlaywrightCheck } from 'checkly/constructs'

const group = new CheckGroupV2('group', {
  name: 'foo',
})

const check = new PlaywrightCheck('check', {
  name: 'Check',
  groupName: 'bar',
  playwrightConfigPath: './playwright.config.ts',
})
