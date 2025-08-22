import * as path from 'path'
import { BrowserCheck } from 'checkly/constructs'
import { syntheticGroup } from '../utils/website-groups.check'

// In this example, we configure two checks for our homepage in a single
// configuration file. Most settings for these checks are defined in the
// check group, in /utils/website-groups.check.ts

new BrowserCheck('browse-and-search-check', {
  name: 'Browse and Search',
  group: syntheticGroup,
  code: {
    entrypoint: path.join(__dirname, '03-browse-and-search.spec.ts')
  },
  runParallel: true,
})

new BrowserCheck('login-browser-check', {
  name: 'Login',
  group: syntheticGroup,
  code: {
    entrypoint: path.join(__dirname, '04-login.spec.ts')
  },
  runParallel: true,
})
