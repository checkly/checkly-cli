import { describe, expect, it } from 'vitest'
import { noSkillWarning } from '../messages'

describe('noSkillWarning', () => {
  it('wraps the warning sentence later and keeps the spacer line', () => {
    const warning = noSkillWarning()

    expect(warning).toContain('agent won\'t have')
    expect(warning).not.toContain('agent won\'t\n  have')
    expect(warning).toContain(
      'Checkly-specific knowledge.\n\n  You can install it later with:',
    )
  })
})
