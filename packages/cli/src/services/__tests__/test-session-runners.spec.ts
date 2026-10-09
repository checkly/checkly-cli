import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { RunLocation } from '../abstract-check-runner.js'
import TestRunner from '../test-runner.js'
import TriggerRunner from '../trigger-runner.js'
import { testSessions } from '../../rest/api.js'

vi.mock('../../rest/api.js', () => ({
  testSessions: {
    run: vi.fn(),
    trigger: vi.fn(),
  },
}))

const RUN_LOCATION: RunLocation = { type: 'PUBLIC', region: 'eu-west-1' }

describe('test-session runners', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('schedules local Playwright checks as cancellable test-session jobs', async () => {
    vi.mocked(testSessions.run).mockResolvedValue({
      data: {
        testSessionId: 'ts-playwright',
        sequenceIds: {
          'playwright-logical-id': 'seq-playwright',
        },
      },
    } as any)

    const playwrightCheck = {
      logicalId: 'playwright-logical-id',
      groupId: undefined,
      getSourceFile: () => 'playwright.check.ts',
    }
    const playwrightBundle = {
      synthesize: vi.fn(() => ({
        checkType: 'PLAYWRIGHT',
        name: 'Playwright Check',
      })),
    }
    const projectBundle = {
      project: { name: 'Playwright Project', logicalId: 'playwright-project' },
      data: {
        'check-group': {},
      },
    }

    const runner = new TestRunner(
      'account-id',
      projectBundle as any,
      [{ construct: playwrightCheck, bundle: playwrightBundle }] as any,
      [],
      RUN_LOCATION,
      60,
      false,
      true,
      null,
      null,
      false,
      '.',
      null,
    )

    const scheduled = await runner.scheduleChecks('suite-id')
    const payload = vi.mocked(testSessions.run).mock.calls[0][0]

    expect(payload.checkRunJobs[0]).toMatchObject({
      checkType: 'PLAYWRIGHT',
      logicalId: 'playwright-logical-id',
      filePath: 'playwright.check.ts',
      sourceInfo: {
        checkRunSuiteId: 'suite-id',
        updateSnapshots: false,
      },
    })
    expect(scheduled).toEqual({
      testSessionId: 'ts-playwright',
      checks: [{ check: playwrightCheck, sequenceId: 'seq-playwright' }],
    })
  })

  it('leaves the deploy-only content hashes out of a check run job', async () => {
    // A check's payload is synthesized the same way for a deploy and for a
    // test session, but only a deploy compares content hashes — and only the
    // deploy schemas accept them, so sending them here would break `checkly
    // test` against an API that has not shipped the matching change yet.
    vi.mocked(testSessions.run).mockResolvedValue({
      data: { testSessionId: 'ts-hashes', sequenceIds: { 'browser-check': 'seq-1' } },
    } as any)

    const check = { logicalId: 'browser-check', groupId: { ref: 'group' }, getSourceFile: () => 'home.check.ts' }
    const bundle = {
      synthesize: vi.fn(() => ({
        checkType: 'BROWSER',
        name: 'Browser Check',
        codeBundleSha256: 'a'.repeat(64),
        snapshots: [{ path: 'home.png', key: 'checks/home.png', sha256: 'b'.repeat(64) }],
      })),
    }
    const groupBundle = {
      synthesize: vi.fn(() => ({ name: 'Group', codeBundleSha256: 'c'.repeat(64) })),
    }
    const projectBundle = {
      project: { name: 'Project', logicalId: 'project' },
      data: { 'check-group': { group: { bundle: groupBundle } } },
    }

    const runner = new TestRunner(
      'account-id',
      projectBundle as any,
      [{ construct: check, bundle }] as any,
      [],
      RUN_LOCATION,
      60,
      false,
      true,
      null,
      null,
      false,
      '.',
      null,
    )

    await runner.scheduleChecks('suite-id')
    const [job] = vi.mocked(testSessions.run).mock.calls[0][0].checkRunJobs

    expect(job).not.toHaveProperty('codeBundleSha256')
    expect(job.group).not.toHaveProperty('codeBundleSha256')
    // The storage key stays: that is what the run needs to fetch the file.
    expect(job.snapshots).toEqual([{ path: 'home.png', key: 'checks/home.png' }])
  })

  it('maps triggered Playwright checks back to the test-session sequence IDs', async () => {
    const playwrightCheck = {
      id: 'playwright-check-id',
      name: 'Triggered Playwright Check',
      checkType: 'PLAYWRIGHT',
    }
    vi.mocked(testSessions.trigger).mockResolvedValue({
      data: {
        checks: [playwrightCheck],
        testSessionId: 'ts-trigger-playwright',
        sequenceIds: {
          'playwright-check-id': 'seq-trigger-playwright',
        },
      },
    } as any)

    const runner = new TriggerRunner(
      'account-id',
      60,
      false,
      true,
      RUN_LOCATION,
      [],
      ['playwright-check-id'],
      [],
      null,
      null,
      undefined,
      null,
    )

    const scheduled = await runner.scheduleChecks('suite-id')

    expect(testSessions.trigger).toHaveBeenCalledWith(expect.objectContaining({
      checkRunSuiteId: 'suite-id',
      checkId: ['playwright-check-id'],
    }))
    expect(scheduled).toEqual({
      testSessionId: 'ts-trigger-playwright',
      checks: [{ check: playwrightCheck, sequenceId: 'seq-trigger-playwright' }],
    })
  })
})
