import { PlaywrightCheck } from 'checkly/constructs'

const check = new PlaywrightCheck('check', {
  name: 'Check',

  playwrightConfigPath: './playwright.config.ts',

  // @ts-expect-error Testing a property that isn't part of the type.
  doubleCheck: true,
})
