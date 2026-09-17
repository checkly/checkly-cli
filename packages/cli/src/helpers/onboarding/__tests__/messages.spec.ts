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

    it('is part of the manual and the agent footer, wrapped to the footer width', () => {
      for (const text of [footer(), agentFooter('claude', false, false)]) {
        expect(text).toContain('npx checkly <command>')
        expect(text).toContain('cannot load this project')
        // eslint-disable-next-line no-control-regex
        const plain = text.replace(/\u001b\[[0-9;]*m/g, '')
        const noteLines = plain.split('\n').filter(line => /npx checkly <command>|cannot load/.test(line))
        expect(noteLines.length).toBeGreaterThanOrEqual(2)
        for (const line of noteLines) expect(line.length).toBeLessThanOrEqual(80)
      }
    })
  })
})
