import { describe, expect, it } from 'vitest'
import { agentFooter, footer, localCliNote, noSkillWarning } from '../messages.js'

describe('noSkillWarning', () => {
  it('wraps the warning sentence later and keeps the spacer line', () => {
    const warning = noSkillWarning()

    expect(warning).toContain('agent won\'t have')
    expect(warning).not.toContain('agent won\'t\n  have')
    expect(warning).toContain(
      'Checkly-specific knowledge.\n\n  You can install it later with:',
    )
  })

  describe('local CLI note', () => {
    it('tells the user to run the project-local CLI through npx', () => {
      const note = localCliNote()
      expect(note).toContain('npx checkly')
      expect(note).toMatch(/global/i)
    })

    it('is part of the manual and the agent footer', () => {
      expect(footer()).toContain(localCliNote())
      expect(agentFooter('claude', false, false)).toContain(localCliNote())
    })
  })
})
