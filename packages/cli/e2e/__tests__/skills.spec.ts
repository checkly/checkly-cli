import { describe, it, expect } from 'vitest'

import { ACTIONS, REFERENCES, SKILL } from '../../src/ai-context/context'
import { runChecklyCli } from '../run-checkly'

const actionIds = ACTIONS.map(a => a.id)
const referenceShortIds = REFERENCES.map(r => r.id.replace('configure-', ''))

describe('checkly skills', () => {
  it('should list actions and references when called without args', async () => {
    const result = await runChecklyCli({
      args: ['skills'],
    })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain(SKILL.description)
    for (const action of ACTIONS) {
      expect(result.stdout).toContain(action.id)
      expect(result.stdout).toContain(action.description)
    }
    for (const ref of REFERENCES) {
      expect(result.stdout).toContain(ref.description)
    }
  })

  it('should show example commands', async () => {
    const result = await runChecklyCli({
      args: ['skills'],
    })
    for (const id of actionIds) {
      expect(result.stdout).toContain(`$ checkly skills ${id}`)
    }
    expect(result.stdout).toContain(`$ checkly skills configure ${referenceShortIds[0]}`)
  })

  it('should show the setup action content', async () => {
    const result = await runChecklyCli({
      args: ['skills', 'setup'],
    })
    expect(result.status).toBe(0)
    expect(result.stdout).toBeTruthy()
  })

  it('should show the configure action content', async () => {
    const result = await runChecklyCli({
      args: ['skills', 'configure'],
    })
    expect(result.status).toBe(0)
    expect(result.stdout).toBeTruthy()
  })

  it('should show a specific reference', async () => {
    const result = await runChecklyCli({
      args: ['skills', 'configure', referenceShortIds[0]],
    })
    expect(result.status).toBe(0)
    expect(result.stdout).toBeTruthy()
  })

  it('should fail for an invalid action', async () => {
    const result = await runChecklyCli({
      args: ['skills', 'nonexistent'],
    })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('not found')
    for (const id of actionIds) {
      expect(result.stderr).toContain(id)
    }
  })

  it('should fail for an invalid reference', async () => {
    const result = await runChecklyCli({
      args: ['skills', 'configure', 'nonexistent-ref'],
    })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('not found')
    expect(result.stderr).toContain(referenceShortIds[0])
  })
})
