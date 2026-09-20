import { Value, expr, ident, ObjectValueBuilder, GeneratedFile } from '../sourcegen/index.js'
import { RetryStrategy, RetryStrategyOptions, RetryStrategyType } from './retry-strategy.js'
import { RETRY_STRATEGY_DEFAULTS } from './internal/retry-strategy-defaults.js'

export type RetryStrategyResource = RetryStrategy

export function valueForRetryStrategy (genfile: GeneratedFile, strategy?: RetryStrategyResource | null): Value {
  genfile.namedImport('RetryStrategyBuilder', 'checkly/constructs')

  // An option is left out only when it equals the value the builder fills
  // in for it; zero is a value (a zero backoff or duration is stored as such)
  // and must not be mistaken for an unset option.
  function buildNumberOption (
    options: RetryStrategyOptions,
    builder: ObjectValueBuilder,
    key: 'baseBackoffSeconds' | 'maxRetries' | 'maxDurationSeconds',
  ): void {
    const value = options[key]
    if (value !== undefined && value !== null && value !== RETRY_STRATEGY_DEFAULTS[key]) {
      builder.number(key, value)
    }
  }

  function buildSameRegionOption (
    options: RetryStrategyOptions,
    builder: ObjectValueBuilder,
  ): void {
    const value = options.sameRegion
    if (value !== undefined && value !== null && value !== RETRY_STRATEGY_DEFAULTS.sameRegion) {
      builder.boolean('sameRegion', value)
    }
  }

  function buildOnlyOnOption (
    options: RetryStrategyOptions,
    builder: ObjectValueBuilder,
  ): void {
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
    buildNumberOption(options, builder, 'baseBackoffSeconds')
    buildNumberOption(options, builder, 'maxRetries')
    buildNumberOption(options, builder, 'maxDurationSeconds')
    buildSameRegionOption(options, builder)
    buildOnlyOnOption(options, builder)
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
    case 'SINGLE_RETRY':
      return expr(ident('RetryStrategyBuilder'), builder => {
        builder.member(ident('singleRetry'))
        builder.call(builder => {
          builder.object(builder => {
            buildNumberOption(strategy, builder, 'baseBackoffSeconds')
            buildSameRegionOption(strategy, builder)
            buildOnlyOnOption(strategy, builder)
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
