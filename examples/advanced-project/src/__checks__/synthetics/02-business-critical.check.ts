import * as path from 'path'
import { BrowserCheck } from 'checkly/constructs'
import { syntheticGroup } from '../utils/website-groups.check'

// Configures two checks for our homepage in a single configuration file.
// Most settings for these checks are defined in the check group,
// in /utils/website-groups.check.ts

new BrowserCheck('browse-and-search-check', {
  name: 'Browse and search',
  group: syntheticGroup,
  code: {
    entrypoint: path.join(__dirname, '03-browse-and-search.spec.ts')
  },
  runParallel: true,
})

new BrowserCheck('login-browser-check', {
  name: 'Add to cart flow',
  group: syntheticGroup,
  code: {
    entrypoint: path.join(__dirname, '04-add-to-cart.spec.ts')
  },
  runParallel: true,
})
