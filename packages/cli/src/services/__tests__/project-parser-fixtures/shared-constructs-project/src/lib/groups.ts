import { CheckGroupV1, CheckGroupV1Props } from 'checkly/constructs'

// Creates a legacy group on behalf of the calling check file; testMatch
// globs are relative to that check file, not to this module.
export function legacyGroup (logicalId: string, props: Partial<CheckGroupV1Props>) {
  return new CheckGroupV1(logicalId, {
    name: logicalId,
    locations: ['eu-west-1'],
    ...props,
  })
}
