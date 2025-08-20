import * as path from 'path'
import { BrowserCheck } from 'checkly/constructs'
import { syntheticGroup } from '../utils/website-groups.check.ts'

// In this example, we configure two checks for our homepage in a single
// configuration file. Most settings for these checks are defined in the
// check group, in /utils/website-groups.check.ts

// We can define multiple checks in a single *.check.ts file.
new BrowserCheck('browse-and-search-check', {
  name: 'Browse and Search',
  group: syntheticGroup,
  code: {
    entrypoint: path.join(__dirname, 'browse-and-search.spec.ts')
  },
  runParallel: true,
})

new BrowserCheck('login-browser-check', {
  name: 'Login',
  group: syntheticGroup,
  code: {
    entrypoint: path.join(__dirname, 'login.spec.ts')
  },
  runParallel: true,
})
