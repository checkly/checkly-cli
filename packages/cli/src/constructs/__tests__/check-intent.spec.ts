import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ApiCheck } from '../api-check.js'
import { CheckIntent } from '../check.js'
import { Diagnostics } from '../diagnostics.js'
import { DnsMonitor } from '../dns-monitor.js'
import { PlaywrightCheck } from '../playwright-check.js'
import { Project } from '../project.js'
import { Session } from '../session.js'
import { UrlMonitor } from '../url-monitor.js'

const completeIntent: CheckIntent = {
  goal: 'Verify that authenticated users can open the dashboard.',
  requiredOutcomes: [
    'Authentication succeeds for a valid user.',
    'The dashboard displays the account overview.',
  ],
  mustPreserve: [
    'Do not remove or weaken the authentication assertion.',
    'Do not replace the dashboard assertion with a generic page-load assertion.',
  ],
}

let nextLogicalId = 0

function apiCheck (intent?: CheckIntent | null): ApiCheck {
  return new ApiCheck(`api-intent-${nextLogicalId++}`, {
    name: 'Dashboard API',
    intent,
    request: {
      method: 'GET',
      url: 'https://example.com/api/dashboard',
    },
  })
}

async function validateIntent (intent: unknown): Promise<Diagnostics> {
  const diagnostics = new Diagnostics()
  await apiCheck(intent as CheckIntent).validate(diagnostics)
  return diagnostics
}

function messages (diagnostics: Diagnostics): string[] {
  return diagnostics.observations.map(observation => observation.message)
}

describe('check intent', () => {
  beforeEach(() => {
    nextLogicalId = 0
    Session.project = new Project('intent-project', {
      name: 'Intent Project',
      repoUrl: 'https://github.com/checkly/checkly-cli',
    })
  })

  afterEach(() => {
    Session.reset()
  })

  describe('synthesis', () => {
    it('normalizes omitted intent sections to empty arrays', () => {
      const synthesized = apiCheck({
        goal: '  Verify that authenticated users can open the dashboard.  ',
      }).synthesize()

      expect(synthesized.intent).toEqual({
        goal: 'Verify that authenticated users can open the dashboard.',
        requiredOutcomes: [],
        mustPreserve: [],
      })
    })

    it('synthesizes complete structured intent', () => {
      const check = apiCheck(completeIntent)

      expect(check.intent).toBe(completeIntent)
      expect(check.synthesize()).toMatchObject({
        intent: completeIntent,
      })
    })

    it('synthesizes intent on runtime checks, monitors, and Playwright checks', () => {
      const monitor = new UrlMonitor('url-intent', {
        name: 'Dashboard URL',
        intent: completeIntent,
        request: {
          url: 'https://example.com/dashboard',
        },
      })
      const playwright = new PlaywrightCheck('playwright-intent', {
        name: 'Dashboard browser flow',
        intent: completeIntent,
        playwrightConfigPath: '/tmp/playwright.config.ts',
      })

      expect(apiCheck(completeIntent).synthesize()).toHaveProperty('intent', completeIntent)
      expect(monitor.intent).toBe(completeIntent)
      expect(monitor.synthesize()).toHaveProperty('intent', completeIntent)
      expect(playwright.intent).toBe(completeIntent)
      expect(playwright.synthesize()).toHaveProperty('intent', completeIntent)
    })

    it('omits undefined intent so deployments do not take ownership of existing intent', () => {
      expect(apiCheck().synthesize()).not.toHaveProperty('intent')
    })

    it('synthesizes null to explicitly clear intent', () => {
      expect(apiCheck(null).synthesize()).toHaveProperty('intent', null)
    })

    it('uses reassigned runtime-check intent for validation and synthesis', async () => {
      const check = apiCheck(completeIntent)
      check.intent = { goal: '   ' }

      const diagnostics = new Diagnostics()
      await check.validate(diagnostics)

      expect(messages(diagnostics)).toEqual(expect.arrayContaining([
        expect.stringContaining('The intent goal must not be blank.'),
      ]))

      check.intent = { goal: '  Verify the replacement dashboard flow.  ' }
      expect(check.synthesize()).toHaveProperty('intent', {
        goal: 'Verify the replacement dashboard flow.',
        requiredOutcomes: [],
        mustPreserve: [],
      })

      check.intent = null
      expect(check.synthesize()).toHaveProperty('intent', null)
    })

    it('uses reassigned monitor intent when synthesizing an explicit clear', () => {
      const monitor = new DnsMonitor('dns-intent-reassignment', {
        name: 'Dashboard DNS',
        intent: completeIntent,
        request: {
          recordType: 'A',
          query: 'example.com',
        },
      })

      monitor.intent = null

      expect(monitor.synthesize()).toHaveProperty('intent', null)
    })
  })

  describe('validation', () => {
    it('accepts a one-character goal and rejects a blank goal', async () => {
      expect((await validateIntent({ goal: 'x' })).isFatal()).toBe(false)

      const diagnostics = await validateIntent({ goal: ' \n\t ' })
      expect(diagnostics.isFatal()).toBe(true)
      expect(messages(diagnostics)).toEqual(expect.arrayContaining([
        expect.stringContaining('The intent goal must not be blank.'),
      ]))
    })

    it('accepts a 2,000-character goal and rejects a 2,001-character goal', async () => {
      expect((await validateIntent({ goal: 'g'.repeat(2_000) })).isFatal()).toBe(false)

      const diagnostics = await validateIntent({ goal: 'g'.repeat(2_001) })
      expect(diagnostics.isFatal()).toBe(true)
      expect(messages(diagnostics)).toEqual(expect.arrayContaining([
        expect.stringContaining('The intent goal must be at most 2000 characters after trimming, got 2001.'),
      ]))
    })

    it('accepts 20 required outcomes and rejects 21', async () => {
      expect((await validateIntent({
        goal: 'Verify the dashboard.',
        requiredOutcomes: Array.from({ length: 20 }, (_, index) => `Outcome ${index}`),
      })).isFatal()).toBe(false)

      const diagnostics = await validateIntent({
        goal: 'Verify the dashboard.',
        requiredOutcomes: Array.from({ length: 21 }, (_, index) => `Outcome ${index}`),
      })
      expect(messages(diagnostics)).toEqual(expect.arrayContaining([
        expect.stringContaining('may contain at most 20 required outcomes, got 21.'),
      ]))
    })

    it('accepts 20 must-preserve guardrails and rejects 21', async () => {
      expect((await validateIntent({
        goal: 'Verify the dashboard.',
        mustPreserve: Array.from({ length: 20 }, (_, index) => `Guardrail ${index}`),
      })).isFatal()).toBe(false)

      const diagnostics = await validateIntent({
        goal: 'Verify the dashboard.',
        mustPreserve: Array.from({ length: 21 }, (_, index) => `Guardrail ${index}`),
      })
      expect(messages(diagnostics)).toEqual(expect.arrayContaining([
        expect.stringContaining('may contain at most 20 must-preserve guardrails, got 21.'),
      ]))
    })

    it.each([
      ['required outcome', 'requiredOutcomes'],
      ['must-preserve guardrail', 'mustPreserve'],
    ] as const)('rejects a blank %s statement', async (label, property) => {
      const diagnostics = await validateIntent({
        goal: 'Verify the dashboard.',
        [property]: ['   '],
      })
      expect(messages(diagnostics)).toEqual(expect.arrayContaining([
        expect.stringContaining(`The intent ${label} must not be blank.`),
      ]))
    })

    it.each([
      ['required outcome', 'requiredOutcomes'],
      ['must-preserve guardrail', 'mustPreserve'],
    ] as const)('accepts a 1,000-character %s and rejects 1,001 characters', async (label, property) => {
      expect((await validateIntent({
        goal: 'Verify the dashboard.',
        [property]: ['s'.repeat(1_000)],
      })).isFatal()).toBe(false)

      const diagnostics = await validateIntent({
        goal: 'Verify the dashboard.',
        [property]: ['s'.repeat(1_001)],
      })
      expect(messages(diagnostics)).toEqual(expect.arrayContaining([
        expect.stringContaining(`The intent ${label} must be at most 1000 characters after trimming, got 1001.`),
      ]))
    })

    it('rejects unknown fields instead of silently discarding them', async () => {
      const diagnostics = await validateIntent({
        goal: 'Verify the dashboard.',
        assertion: 'The dashboard is visible.',
      })
      expect(messages(diagnostics)).toEqual(expect.arrayContaining([
        expect.stringContaining('"intent" contains unknown field "assertion".'),
      ]))
    })

    it('rejects non-string statements and non-array statement sections', async () => {
      const diagnostics = await validateIntent({
        goal: 'Verify the dashboard.',
        requiredOutcomes: 'The dashboard loads.',
        mustPreserve: [42],
      })

      expect(messages(diagnostics)).toEqual(expect.arrayContaining([
        expect.stringContaining('"intent.requiredOutcomes" must be an array of strings.'),
        expect.stringContaining('The intent must-preserve guardrail must be a string.'),
      ]))
    })
  })
})
