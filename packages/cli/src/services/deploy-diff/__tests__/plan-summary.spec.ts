import { describe, expect, it } from 'vitest'

import { reducePlanForAgent } from '../plan-summary.js'

/**
 * The plan as the agent envelope carries it: every entry and every changed
 * property, without the state the terminal rendering needs.
 */
describe('reducePlanForAgent', () => {
  it('drops the deployed state and the redaction table that applies to it', () => {
    const [reduced] = reducePlanForAgent([
      {
        type: 'check',
        logicalId: 'api',
        action: 'UPDATE',
        changes: [{ path: '/name', origin: 'code', before: 'a', after: 'b' }],
        before: { id: 'x' },
        redactions: [{ path: '/request/basicAuth/password', kind: 'value' }],
      },
    ])
    expect(reduced).toEqual({
      type: 'check',
      logicalId: 'api',
      action: 'UPDATE',
      changes: [{ path: '/name', origin: 'code', before: 'a', after: 'b' }],
    })
  })
})
