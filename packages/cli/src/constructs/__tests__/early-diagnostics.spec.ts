import { describe, it, expect, beforeEach } from 'vitest'

import { Session } from '../session.js'
import { Construct } from '../construct.js'
import { Diagnostics, ErrorDiagnostic } from '../diagnostics.js'
import { ConstructDiagnostics } from '../construct-diagnostics.js'

class EarlyConstruct extends Construct {
  constructor (logicalId: string) {
    super('test', logicalId)
    this.earlyDiagnostics.add(new ErrorDiagnostic({
      title: 'Early problem',
      message: 'Something the constructor noticed.',
      error: new Error('Something the constructor noticed.'),
    }))
  }

  describe (): string {
    return `Test:${this.logicalId}`
  }

  synthesize () {
    return null
  }
}

describe('Construct early diagnostics', () => {
  beforeEach(() => {
    Session.reset()
    Session.project = { addResource: () => {} } as any
  })

  it('surfaces diagnostics recorded in the constructor via validate()', async () => {
    const construct = new EarlyConstruct('my-check')
    const diagnostics = new Diagnostics()
    await construct.validate(diagnostics)
    expect(diagnostics.isFatal()).toBe(true)
    expect(diagnostics.observations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        message: expect.stringContaining('Something the constructor noticed.'),
      }),
    ]))
  })

  it('attributes early diagnostics to the construct when validated via ConstructDiagnostics', async () => {
    const construct = new EarlyConstruct('my-check')
    const diagnostics = new ConstructDiagnostics(construct)
    await construct.validate(diagnostics)
    expect(diagnostics.observations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        title: expect.stringContaining('[Test:my-check]'),
      }),
    ]))
  })

  it('does not record any diagnostics when the constructor adds none', async () => {
    class QuietConstruct extends Construct {
      constructor (logicalId: string) {
        super('test', logicalId)
      }

      describe (): string {
        return `Quiet:${this.logicalId}`
      }

      synthesize () {
        return null
      }
    }

    const construct = new QuietConstruct('my-check')
    const diagnostics = new Diagnostics()
    await construct.validate(diagnostics)
    expect(diagnostics.isFatal()).toBe(false)
    expect(diagnostics.observations).toHaveLength(0)
  })
})
