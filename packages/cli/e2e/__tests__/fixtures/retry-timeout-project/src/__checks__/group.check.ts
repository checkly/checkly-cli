/* eslint-disable no-new */
import { BrowserCheck } from 'checkly/constructs'

// A check that takes a while and then fails on every attempt. With retries the
// run legitimately outlives a small --timeout, which must not cut it short:
// every run-start and retry attempt restarts the per-check timeout.
new BrowserCheck('slow-failing-browser-check', {
  name: 'Slow failing check',
  activated: false,
  code: {
    content: [
      'await new Promise(resolve => setTimeout(resolve, 8000))',
      'throw new Error("Failing Check Result")',
    ].join('\n'),
  },
})
