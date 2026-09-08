import { afterEach, beforeEach, describe, expect, it } from 'vitest'

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
