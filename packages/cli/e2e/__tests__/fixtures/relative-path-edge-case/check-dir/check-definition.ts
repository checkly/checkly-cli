// This file isn't actually a *.check.ts file. It simply exports the check object.
// The `entrypoint` should be applied relative to this file (check-definition.ts), though, in order to import the file.
import { BrowserCheck } from '@checkly/cli/constructs'

export const check = new BrowserCheck('example-check', {
  name: 'Browser Check',
  code: { entrypoint: 'example.ts' },
})