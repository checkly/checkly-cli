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

  it('schedules local Agentic checks as cancellable test-session jobs', async () => {
    vi.mocked(testSessions.run).mockResolvedValue({
      data: {
        testSessionId: 'ts-agentic',
        sequenceIds: {
          'agentic-logical-id': 'seq-agentic',
        },
      },
    } as any)

    const agenticCheck = {
      logicalId: 'agentic-logical-id',
      groupId: undefined,
      getSourceFile: () => 'agentic.check.ts',
    }
    const agenticBundle = {
      synthesize: vi.fn(() => ({
        checkType: 'AGENTIC',
        name: 'Agentic Check',
      })),
    }
    const projectBundle = {
      project: { name: 'Agentic Project', logicalId: 'agentic-project' },
      data: {
        'check-group': {},
      },
    }

    const runner = new TestRunner(
      'account-id',
      projectBundle as any,
      [{ construct: agenticCheck, bundle: agenticBundle }] as any,
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
      checkType: 'AGENTIC',
      logicalId: 'agentic-logical-id',
      filePath: 'agentic.check.ts',
      sourceInfo: {
        checkRunSuiteId: 'suite-id',
        updateSnapshots: false,
      },
    })
    expect(scheduled).toEqual({
      testSessionId: 'ts-agentic',
      checks: [{ check: agenticCheck, sequenceId: 'seq-agentic' }],
    })
  })

  it('maps triggered Agentic checks back to the test-session sequence IDs', async () => {
    const agenticCheck = {
      id: 'agentic-check-id',
      name: 'Triggered Agentic Check',
      checkType: 'AGENTIC',
    }
    vi.mocked(testSessions.trigger).mockResolvedValue({
      data: {
        checks: [agenticCheck],
        testSessionId: 'ts-trigger-agentic',
        sequenceIds: {
          'agentic-check-id': 'seq-trigger-agentic',
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
      ['agentic-check-id'],
      [],
      null,
      null,
      undefined,
      null,
    )

    const scheduled = await runner.scheduleChecks('suite-id')

    expect(testSessions.trigger).toHaveBeenCalledWith(expect.objectContaining({
      checkRunSuiteId: 'suite-id',
      checkId: ['agentic-check-id'],
    }))
    expect(scheduled).toEqual({
      testSessionId: 'ts-trigger-agentic',
      checks: [{ check: agenticCheck, sequenceId: 'seq-trigger-agentic' }],
    })
  })
})
