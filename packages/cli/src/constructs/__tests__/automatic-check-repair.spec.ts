import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { Diagnostics } from '../diagnostics.js'
import { loadSnapshot } from '../../runtimes/index.js'
import { BrowserCheck } from '../browser-check.js'
import { MultiStepCheck } from '../multi-step-check.js'
import { Project } from '../project.js'
import { Session } from '../session.js'

describe('automatic check repair', () => {
  beforeEach(() => {
    Session.project = new Project('automatic-check-repair-project', {
      name: 'Automatic check repair project',
      repoUrl: 'https://github.com/checkly/checkly-cli',
    })
  })

  afterEach(() => {
    Session.reset()
  })

  it.each([true, false, null])('supports BrowserCheck ownership %j', aiAutoRepairEnabled => {
    const check = new BrowserCheck(`browser-${String(aiAutoRepairEnabled)}`, {
      name: 'Browser check',
      code: { content: 'console.log("browser")' },
      aiAutoRepairEnabled,
    })

    expect(check.aiAutoRepairEnabled).toBe(aiAutoRepairEnabled)
    expect(check.synthesize()).toHaveProperty('aiAutoRepairEnabled', aiAutoRepairEnabled)
  })

  it.each([true, false, null])('supports MultiStepCheck ownership %j', aiAutoRepairEnabled => {
    const check = new MultiStepCheck(`multi-step-${String(aiAutoRepairEnabled)}`, {
      name: 'MultiStep check',
      code: { content: 'console.log("multi-step")' },
      aiAutoRepairEnabled,
    })

    expect(check.aiAutoRepairEnabled).toBe(aiAutoRepairEnabled)
    expect(check.synthesize()).toHaveProperty('aiAutoRepairEnabled', aiAutoRepairEnabled)
  })

  it('omits automatic repair when the construct does not take ownership', () => {
    const browser = new BrowserCheck('browser-omitted', {
      name: 'Browser check',
      code: { content: 'console.log("browser")' },
    })
    const multiStep = new MultiStepCheck('multi-step-omitted', {
      name: 'MultiStep check',
      code: { content: 'console.log("multi-step")' },
    })

    expect(browser.synthesize()).not.toHaveProperty('aiAutoRepairEnabled')
    expect(multiStep.synthesize()).not.toHaveProperty('aiAutoRepairEnabled')
  })
})

describe.each([['BrowserCheck', BrowserCheck], ['MultiStepCheck', MultiStepCheck]] as const)(
  '%s automatic repair validation', (_name, CheckClass) => {
    beforeEach(async () => {
      Session.project = new Project('repair-validation', { name: 'Repair validation' })
      Session.availableRuntimes = await loadSnapshot()
      Session.defaultRuntimeId = '2025.04'
    })

    afterEach(() => Session.reset())

    it.each([true, false, null, undefined])('accepts %j and preserves its ownership state', async value => {
      const check = new CheckClass('check', {
        name: 'Check', code: { content: 'console.log("check")' }, aiAutoRepairEnabled: value,
      })
      const diagnostics = new Diagnostics()
      await check.validate(diagnostics)
      expect(diagnostics.isFatal()).toBe(false)
      if (value === undefined) {
        expect(check.synthesize()).not.toHaveProperty('aiAutoRepairEnabled')
      } else {
        expect(check.synthesize()).toHaveProperty('aiAutoRepairEnabled', value)
      }
    })

    it.each(['false', 'true', 0, 1, {}, []])('rejects invalid JavaScript input %j before deploy', async value => {
      const check = new CheckClass('check', {
        name: 'Check', code: { content: 'console.log("check")' },
        aiAutoRepairEnabled: value as unknown as boolean,
      })
      const diagnostics = new Diagnostics()
      await check.validate(diagnostics)
      expect(diagnostics.isFatal()).toBe(true)
      expect(diagnostics.observations.map(observation => observation.message)).toContainEqual(
        expect.stringContaining('"aiAutoRepairEnabled" must be a boolean or null'),
      )
    })

    it('validates reassignment and can relinquish ownership after an explicit override', async () => {
      const check = new CheckClass('check', { name: 'Check', code: { content: 'console.log("check")' } })
      check.aiAutoRepairEnabled = 'false' as unknown as boolean
      const diagnostics = new Diagnostics()
      await check.validate(diagnostics)
      expect(diagnostics.isFatal()).toBe(true)
      for (const value of [true, false, null]) {
        check.aiAutoRepairEnabled = value
        expect(check.synthesize()).toHaveProperty('aiAutoRepairEnabled', value)
      }
      check.aiAutoRepairEnabled = undefined
      expect(check.synthesize()).not.toHaveProperty('aiAutoRepairEnabled')
    })
  },
)
