import { ExecaError } from 'execa'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

import { ACTIONS, INVESTIGATE_REFERENCES, REFERENCES, SKILL } from '../../src/ai-context/context'
import { FixtureSandbox } from '../../src/testing/fixture-sandbox'
import { runCheckly } from '../run-checkly'

const actionIds = ACTIONS.map(a => a.id)
const referenceShortIds = REFERENCES.map(r => r.id.replace('configure-', ''))
const investigateReferenceShortIds = INVESTIGATE_REFERENCES.map(r => r.id.replace('investigate-', ''))
const referencesByAction = ACTIONS.flatMap(action => {
  if (!('references' in action)) {
    return []
  }

  return action.references.map(reference => ({
    actionId: action.id,
    shortId: reference.id.replace(`${action.id}-`, ''),
  }))
})

describe('checkly skills', () => {
  let fixt: FixtureSandbox

  beforeAll(async () => {
    fixt = await FixtureSandbox.create({})
  }, 180_000)

  afterAll(async () => {
    await fixt?.destroy()
  })

  it('should list actions and references when called without args', async () => {
    const { stdout } = await runCheckly(fixt, ['skills'])
    expect(stdout).toContain(SKILL.description)
    for (const action of ACTIONS) {
      expect(stdout).toContain(action.id)
      expect(stdout).toContain(action.description)
    }
    for (const ref of REFERENCES) {
      expect(stdout).toContain(ref.description)
    }
    for (const ref of INVESTIGATE_REFERENCES) {
      expect(stdout).toContain(ref.description)
    }
  })

  it('should show example commands', async () => {
    const { stdout } = await runCheckly(fixt, ['skills'])
    for (const id of actionIds) {
      expect(stdout).toContain(`$ checkly skills ${id}`)
    }
    expect(stdout).toContain(`$ checkly skills configure ${referenceShortIds[0]}`)
    expect(stdout).toContain(`$ checkly skills investigate ${investigateReferenceShortIds[0]}`)
  })

  it('should list all actions and references in help output', async () => {
    const { stdout } = await runCheckly(fixt, ['skills', '--help'])

    expect(stdout).toContain('Available actions and references:')
    expect(stdout).toContain('checkly skills configure api-checks')
    expect(stdout).toContain('checkly skills investigate alerting')

    for (const id of actionIds) {
      expect(stdout).toContain(`|- ${id}`)
    }

    for (const { actionId, shortId } of referencesByAction) {
      expect(stdout).toContain(`|- ${actionId}`)
      expect(stdout).toContain(`|  |- ${shortId}`)
    }

    expect(stdout).not.toContain(REFERENCES[0].description)
    expect(stdout).not.toContain(INVESTIGATE_REFERENCES[0].description)
  })

  it('should show the initialize action content', async () => {
    const { stdout } = await runCheckly(fixt, ['skills', 'initialize'])
    expect(stdout).toBeTruthy()
  })

  it('should show the configure action content', async () => {
    const { stdout } = await runCheckly(fixt, ['skills', 'configure'])
    expect(stdout).toBeTruthy()
  })

  it('should show a specific reference', async () => {
    const { stdout } = await runCheckly(fixt, ['skills', 'configure', referenceShortIds[0]])
    expect(stdout).toBeTruthy()
  })

  it('should show the alerting investigation reference', async () => {
    const { stdout } = await runCheckly(fixt, ['skills', 'investigate', 'alerting'])
    expect(stdout).toContain('Investigating Alerting Behavior')
    expect(stdout).toContain('checkly checks list --output json --limit 100')
    expect(stdout).toContain('Effective Alerting Decision Tree')
  })

  it('should fail for an invalid action', async () => {
    try {
      await runCheckly(fixt, ['skills', 'nonexistent'])
      expect.unreachable('Expected command to fail')
    } catch (err) {
      if (err instanceof ExecaError) {
        expect(err.exitCode).not.toBe(0)
        expect(err.stderr).toContain('not found')
        for (const id of actionIds) {
          expect(err.stderr).toContain(id)
        }
      } else {
        throw err
      }
    }
  })

  it('should fail for an invalid reference', async () => {
    try {
      await runCheckly(fixt, ['skills', 'configure', 'nonexistent-ref'])
      expect.unreachable('Expected command to fail')
    } catch (err) {
      if (err instanceof ExecaError) {
        expect(err.exitCode).not.toBe(0)
        expect(err.stderr).toContain('not found')
        expect(err.stderr).toContain(referenceShortIds[0])
      } else {
        throw err
      }
    }
  })
})
