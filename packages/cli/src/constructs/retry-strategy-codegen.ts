import { Value, expr, ident, ObjectValueBuilder, GeneratedFile } from '../sourcegen'
import { RetryStrategy, RetryStrategyOptions, RetryStrategyType } from './retry-strategy'

export type RetryStrategyResource = RetryStrategy

export function valueForRetryStrategy (genfile: GeneratedFile, strategy?: RetryStrategyResource | null): Value {
  genfile.namedImport('RetryStrategyBuilder', 'checkly/constructs')

  function buildBaseBackoffSecondsOption (
    options: RetryStrategyOptions,
    builder: ObjectValueBuilder,
  ): void {
    if (options.baseBackoffSeconds) {
      builder.number('baseBackoffSeconds', options.baseBackoffSeconds)
    }
  }

  function buildMaxRetriesOption (
    options: RetryStrategyOptions,
    builder: ObjectValueBuilder,
  ): void {
    if (options.maxRetries) {
      builder.number('maxRetries', options.maxRetries)
    }
  }

  function buildMaxDurationSecondsOption (
    options: RetryStrategyOptions,
    builder: ObjectValueBuilder,
  ): void {
    if (options.maxDurationSeconds) {
      builder.number('maxDurationSeconds', options.maxDurationSeconds)
    }
  }

  function buildSameRegionOption (
    options: RetryStrategyOptions,
    builder: ObjectValueBuilder,
  ): void {
    if (options.sameRegion !== undefined) {
      builder.boolean('sameRegion', options.sameRegion)
    }

    if (options.onlyOn !== undefined) {
      const onlyOn = Array.isArray(options.onlyOn) ? options.onlyOn : [options.onlyOn]
      if (onlyOn.length === 1) {
        builder.string('onlyOn', onlyOn[0])
      } else {
        builder.array('onlyOn', builder => {
          for (const condition of onlyOn) {
            builder.string(condition)
          }
        })
      }
    }
  }

  function buildCommonOptions (
    options: RetryStrategyOptions,
    builder: ObjectValueBuilder,
  ): void {
    buildBaseBackoffSecondsOption(options, builder)
    buildMaxRetriesOption(options, builder)
    buildMaxDurationSecondsOption(options, builder)
    buildSameRegionOption(options, builder)
  }

  if (strategy === null || strategy === undefined) {
    return expr(ident('RetryStrategyBuilder'), builder => {
      builder.member(ident('noRetries'))
      builder.call(builder => {
        builder.empty()
      })
    })
  }

  switch (strategy.type as RetryStrategyType) {
    case 'FIXED':
      return expr(ident('RetryStrategyBuilder'), builder => {
        builder.member(ident('fixedStrategy'))
        builder.call(builder => {
          builder.object(builder => {
            buildCommonOptions(strategy, builder)
          })
        })
      })
    case 'LINEAR':
      return expr(ident('RetryStrategyBuilder'), builder => {
        builder.member(ident('linearStrategy'))
        builder.call(builder => {
          builder.object(builder => {
            buildCommonOptions(strategy, builder)
          })
        })
      })
    case 'EXPONENTIAL':
      return expr(ident('RetryStrategyBuilder'), builder => {
        builder.member(ident('exponentialStrategy'))
        builder.call(builder => {
          builder.object(builder => {
            buildCommonOptions(strategy, builder)
          })
        })
      })
    case 'SINGLE':
      return expr(ident('RetryStrategyBuilder'), builder => {
        builder.member(ident('singleRetry'))
        builder.call(builder => {
          builder.object(builder => {
            buildBaseBackoffSecondsOption(strategy, builder)
            buildSameRegionOption(strategy, builder)
          })
        })
      })
    case 'NO_RETRIES':
      return expr(ident('RetryStrategyBuilder'), builder => {
        builder.member(ident('noRetries'))
        builder.call(builder => {
          builder.empty()
        })
      })
    default:
      throw new Error(`Unsupported retry strategy type ${strategy.type}`)
  }
}
