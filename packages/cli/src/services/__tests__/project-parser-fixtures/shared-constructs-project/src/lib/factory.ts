import { BrowserCheck } from 'checkly/constructs'

// Creates a browser check on behalf of the calling check file; the entrypoint
// is relative to that check file, not to this module.
export function browserCheck (logicalId: string, entrypoint: string) {
  return new BrowserCheck(logicalId, {
    name: logicalId,
    code: { entrypoint },
  })
}
