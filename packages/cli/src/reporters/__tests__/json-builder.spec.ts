import { describe, expect, test, vi } from 'vitest'

import { JsonBuilder, buildPerTypeDiagnostics } from '../json.js'
import { generateMapAndTestResultIds } from './helpers.js'
import { checkFilesMap } from '../abstract-list.js'
import { SequenceId } from '../../services/abstract-check-runner.js'
import {
  tracerouteCheckResult,
  grpcCheckResult,
  sslCheckResult,
} from './fixtures/uptime-check-results.js'

vi.mock('../../rest/api', () => ({
  getDefaults: () => ({
    baseURL: 'https://api.checklyhq.com',
    accountId: 'test-account-123',
    Authorization: 'Bearer test-key',
    apiKey: 'test-key',
  }),
}))

const testSessionId = '0c4c64b3-79c5-44a6-ae07-b580ce73f328'
const runLocation = 'eu-west-1'
describe('JsonBuilder', () => {
  test('renders basic JSON output with no assets & links', () => {
    const checkFilesMap = generateMapAndTestResultIds({ includeTestResultIds: false })
    const json = new JsonBuilder({
      testSessionId: undefined,
      numChecks: checkFilesMap.size,
      runLocation,
      checkFilesMap,
    }).render()
    expect(json).toMatchSnapshot('json-basic')
  })
  test('renders basic JSON output with run errors', () => {
    const checkFilesMap = generateMapAndTestResultIds({ includeTestResultIds: false, includeRunErrors: true })
    const json = new JsonBuilder({
      testSessionId: undefined,
      numChecks: checkFilesMap.size,
      runLocation,
      checkFilesMap,
    }).render()
    expect(json).toMatchSnapshot('json-basic')
  })
  test('renders JSON markdown output with assets & links', () => {
    const checkFilesMap = generateMapAndTestResultIds({ includeTestResultIds: true })
    const json = new JsonBuilder({
      testSessionId,
      numChecks: checkFilesMap.size,
      runLocation,
      checkFilesMap,
    }).render()
    expect(json).toMatchSnapshot('json-with-assets-links')
  })

  test('emits per-type diagnostics for failed traceroute/grpc/ssl runs', () => {
    const map: checkFilesMap = new Map([
      ['src/uptime/diagnostics.check.ts', new Map([
        [tracerouteCheckResult.sourceInfo.sequenceId as SequenceId, {
          result: tracerouteCheckResult as any,
          titleString: tracerouteCheckResult.name,
          testResultId: undefined,
          numRetries: 0,
          links: undefined,
        }],
        [grpcCheckResult.sourceInfo.sequenceId as SequenceId, {
          result: grpcCheckResult as any,
          titleString: grpcCheckResult.name,
          testResultId: undefined,
          numRetries: 0,
          links: undefined,
        }],
        [sslCheckResult.sourceInfo.sequenceId as SequenceId, {
          result: sslCheckResult as any,
          titleString: sslCheckResult.name,
          testResultId: undefined,
          numRetries: 0,
          links: undefined,
        }],
      ])],
    ])

    const json = new JsonBuilder({
      testSessionId: undefined,
      numChecks: 3,
      runLocation,
      checkFilesMap: map,
    }).render()
    const parsed = JSON.parse(json)

    const byType = Object.fromEntries(parsed.checks.map((c: any) => [c.checkType, c]))

    expect(byType.TRACEROUTE.result).toBe('Fail')
    expect(byType.TRACEROUTE.diagnostics.tracerouteCheckResult.totalHops).toBe(30)
    expect(byType.TRACEROUTE.diagnostics.tracerouteCheckResult.destinationReached).toBe(false)
    expect(byType.TRACEROUTE.diagnostics.tracerouteCheckResult.truncationReason).toBe('max-hops')
    expect(byType.TRACEROUTE.diagnostics.tracerouteCheckResult.response.hops).toHaveLength(2)

    expect(byType.GRPC.diagnostics.grpcCheckResult.grpcStatusCode).toBe(14)
    expect(byType.GRPC.diagnostics.grpcCheckResult.grpcStatusMessage).toBe('connection refused')
    expect(byType.GRPC.diagnostics.grpcCheckResult.healthStatusLabel).toBe('NOT_SERVING')
    expect(byType.GRPC.diagnostics.grpcCheckResult.discoveredMethods).toContain('grpc.health.v1.Health/Watch')

    expect(byType.SSL.diagnostics.sslCheckResult.tlsVersion).toBe('TLS 1.3')
    expect(byType.SSL.diagnostics.sslCheckResult.daysUntilExpiry).toBe(-5)
    expect(byType.SSL.diagnostics.sslCheckResult.chainTrusted).toBe(false)
    expect(byType.SSL.diagnostics.sslCheckResult.hostnameVerified).toBe(false)
  })
  test('reports checks without a result as not finished when the run stopped early', () => {
    const map = generateMapAndTestResultIds({ includeTestResultIds: false })
    map.get('folder/api.check.ts')!.set('seq-slow', {
      check: { name: 'Slow Check', getSourceFile: () => 'folder/api.check.ts' } as any,
      titleString: 'Slow Check',
      numRetries: 0,
    })
    const summary = JSON.parse(new JsonBuilder({
      testSessionId: undefined,
      numChecks: 3,
      runLocation,
      checkFilesMap: map,
      maxFailuresReached: 1,
    }).render())

    expect(summary.stoppedEarly).toEqual({ reason: 'maxFailures', maxFailures: 1 })
    expect(summary.checks).toHaveLength(3)
    expect(summary.checks).toContainEqual({
      result: 'Not finished',
      name: 'Slow Check',
      checkType: null,
      durationMilliseconds: null,
      filename: 'folder/api.check.ts',
      link: null,
      runError: null,
      retries: 0,
    })
  })

  test('reports a check the CLI stopped waiting for as timed out', () => {
    const runError = 'Reached timeout of 600 seconds waiting for check result.'
    const map: checkFilesMap = new Map([
      ['folder/timeout.check.ts', new Map([
        ['seq-timeout', {
          result: { name: 'Slow check', sourceFile: 'folder/timeout.check.ts', hasFailures: true, runError, timedOut: true },
          titleString: 'Slow check',
          numRetries: 0,
        }],
        ['seq-crashed', {
          result: { name: 'Crashed check', sourceFile: 'folder/timeout.check.ts', hasFailures: true, runError: 'Error' },
          titleString: 'Crashed check',
          numRetries: 0,
        }],
      ])],
    ])
    const summary = JSON.parse(new JsonBuilder({
      testSessionId: undefined,
      numChecks: 2,
      runLocation,
      checkFilesMap: map,
    }).render())

    expect(summary.checks.map((c: any) => [c.name, c.result, c.runError])).toEqual([
      ['Slow check', 'Timed out', runError],
      ['Crashed check', 'Fail', 'Error'],
    ])
  })

  test('omits stoppedEarly when the run finished', () => {
    const checkFilesMap = generateMapAndTestResultIds({ includeTestResultIds: false })
    const summary = JSON.parse(new JsonBuilder({
      testSessionId: undefined,
      numChecks: checkFilesMap.size,
      runLocation,
      checkFilesMap,
    }).render())
    expect(summary).not.toHaveProperty('stoppedEarly')
  })
})

describe('buildPerTypeDiagnostics()', () => {
  test('returns undefined for non-diagnostic check types', () => {
    expect(buildPerTypeDiagnostics({ checkType: 'API', checkRunData: { response: {} } })).toBeUndefined()
  })
  test('returns undefined when no artifact or error is present', () => {
    expect(buildPerTypeDiagnostics({ checkType: 'SSL' })).toBeUndefined()
  })
  test('emits a sparse diagnostic from a requestError alone', () => {
    const diag = buildPerTypeDiagnostics({ checkType: 'TRACEROUTE', checkRunData: { requestError: 'dns failure' } })
    expect(diag).toEqual({
      tracerouteCheckResult: {
        totalHops: null,
        destinationReached: null,
        finalHopLatency: null,
        truncationReason: null,
        requestError: 'dns failure',
        response: null,
      },
    })
  })
})
