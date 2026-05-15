import { ExecaError } from 'execa'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

import { ACTIONS, REFERENCES, SKILL } from '../../src/ai-context/context'
import { FixtureSandbox } from '../../src/testing/fixture-sandbox'
import { runCheckly } from '../run-checkly'

const actionIds = ACTIONS.map(a => a.id)
const referenceShortIds = REFERENCES.map(r => r.id.replace('configure-', ''))

describe('checkly skills', () => {
  let fixt: FixtureSandbox

  beforeAll(async () => {
    fixt = await FixtureSandbox.create({ template: 'bare' })
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
  })

  it('should show example commands', async () => {
    const { stdout } = await runCheckly(fixt, ['skills'])
    for (const id of actionIds) {
      expect(stdout).toContain(`$ checkly skills ${id}`)
    }
    expect(stdout).toContain(`$ checkly skills configure ${referenceShortIds[0]}`)
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
