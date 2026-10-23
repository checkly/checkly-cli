/* eslint-disable no-new */
import { BrowserCheck } from 'checkly/constructs'

new BrowserCheck('failing-browser-check', {
  name: 'Failing check',
  activated: false,
  code: {
    content: 'throw new Error("Failing Check Result")',
  },
})

// Passes, but only long after the failing check has reported. With
// --max-failures=1 the CLI must not wait for it.
new BrowserCheck('slow-passing-browser-check', {
  name: 'Slow passing check',
  activated: false,
  code: {
    content: 'await new Promise(resolve => setTimeout(resolve, 90_000))',
  },
})
