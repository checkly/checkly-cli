import * as path from 'path'
import { BrowserCheck } from 'checkly/constructs'
import { syntheticGroup } from '../utils/website-groups.check'

// Even though there are multiple test() function calls in the .spec
// file, they will all run and report as a single Checkly monitor. 
// This check is deactivated, run `npx checkly test --update-snapshots` first. 

new BrowserCheck('playwright-techniques', {
  name: 'Playwright techniques demo',
  group: syntheticGroup,
  activated: false,
  code: {
    entrypoint: path.join(__dirname, '07-playwright-techniques.spec.ts')
  },
  runParallel: true,
})
