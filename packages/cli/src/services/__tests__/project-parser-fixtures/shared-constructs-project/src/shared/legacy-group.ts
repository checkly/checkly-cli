import { CheckGroupV1 } from 'checkly/constructs'

// The testMatch matches nothing next to the check file importing this module,
// so the checks come from next to this file.
export const legacyShared = new CheckGroupV1('legacy-shared', {
  name: 'Legacy shared',
  locations: ['eu-west-1'],
  browserChecks: { testMatch: 'shared-*.test.ts' },
})
