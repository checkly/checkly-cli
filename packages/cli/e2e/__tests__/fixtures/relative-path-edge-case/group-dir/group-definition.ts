// This file isn't actually a *.check.ts file. It simply exports the group.
// The `testMatch` should be applied relative to this file (group-definition.ts), though, in order to import example.ts.
import { CheckGroup } from '@checkly/cli/constructs'

export const group = new CheckGroup('group', {
  name: 'Check Group',
  locations: [],
  browserChecks: { testMatch: 'example.ts' },
})
