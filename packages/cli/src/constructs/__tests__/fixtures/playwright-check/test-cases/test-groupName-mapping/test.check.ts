import { CheckGroupV2, PlaywrightCheck } from 'checkly/constructs'

const group = new CheckGroupV2('group', {
  name: 'b801a908-8d3c-4a94-92ab-cf15f58a59b4',
})

const check = new PlaywrightCheck('check', {
  name: 'Check',
  groupName: 'b801a908-8d3c-4a94-92ab-cf15f58a59b4',
  playwrightConfigPath: './playwright.config.ts',
})
