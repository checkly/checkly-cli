import { describe, expect, it } from 'vitest'

import { valueForRetryStrategy } from '../retry-strategy-codegen.js'
import { GeneratedFile, Output } from '../../sourcegen/index.js'

/**
 * A retry option is left out of generated code only when it equals the
 * value `RetryStrategyBuilder` fills in for it; zero is a value.
 */
function render (strategy: Parameters<typeof valueForRetryStrategy>[1]): string {
  const output = new Output()
  const file = new GeneratedFile('foo.ts')
  valueForRetryStrategy(file, strategy).render(output)
  return output.finalize()
}

describe('valueForRetryStrategy', () => {
  it('leaves out every option equal to the builder default', () => {
    const source = render({ type: 'FIXED', baseBackoffSeconds: 60, maxRetries: 2, maxDurationSeconds: 600, sameRegion: true })
    expect(source).toContain('RetryStrategyBuilder.fixedStrategy(')
    expect(source).not.toContain('baseBackoffSeconds')
    expect(source).not.toContain('maxRetries')
    expect(source).not.toContain('maxDurationSeconds')
    expect(source).not.toContain('sameRegion')
  })

  it('keeps a zero backoff and a zero duration, which the builder would replace', () => {
    const source = render({ type: 'LINEAR', baseBackoffSeconds: 0, maxRetries: 2, maxDurationSeconds: 0, sameRegion: true })
    expect(source).toContain('baseBackoffSeconds: 0')
    expect(source).toContain('maxDurationSeconds: 0')
    expect(source).not.toContain('maxRetries')
  })

  it('keeps sameRegion when false', () => {
    const source = render({ type: 'EXPONENTIAL', baseBackoffSeconds: 60, maxRetries: 2, maxDurationSeconds: 600, sameRegion: false })
    expect(source).toContain('sameRegion: false')
  })

  it('keeps a single retry\'s zero backoff', () => {
    const source = render({ type: 'SINGLE_RETRY', baseBackoffSeconds: 0, sameRegion: true })
    expect(source).toContain('RetryStrategyBuilder.singleRetry(')
    expect(source).toContain('baseBackoffSeconds: 0')
    expect(source).not.toContain('sameRegion')
  })

  it('renders no retries for a missing strategy', () => {
    expect(render(null)).toContain('RetryStrategyBuilder.noRetries()')
  })
})
