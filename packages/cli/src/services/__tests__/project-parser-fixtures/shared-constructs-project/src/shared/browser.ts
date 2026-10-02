import { BrowserCheck } from 'checkly/constructs'

// The entrypoint is relative to this file, not to the check file importing it.
export const sharedBrowser = new BrowserCheck('shared-browser', {
  name: 'Shared browser',
  code: {
    entrypoint: './homepage.test.ts',
  },
})
