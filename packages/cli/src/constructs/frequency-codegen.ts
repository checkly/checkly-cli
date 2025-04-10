import { expr, GeneratedFile, ident, NumberValue, Value } from '../sourcegen'
import { Frequency } from './frequency'

export type FrequencyResource = Frequency | number

export function valueForFrequency (genfile: GeneratedFile, frequency: FrequencyResource): Value {
  if (typeof frequency === 'number') {
    return new NumberValue(frequency)
  }

  genfile.import('Frequency', 'checkly/constructs')

  const predefined = {
    EVERY_10S: Frequency.EVERY_10S,
    EVERY_20S: Frequency.EVERY_20S,
    EVERY_30S: Frequency.EVERY_30S,
    EVERY_1M: Frequency.EVERY_1M,
    EVERY_2M: Frequency.EVERY_2M,
    EVERY_5M: Frequency.EVERY_5M,
    EVERY_10M: Frequency.EVERY_10M,
    EVERY_15M: Frequency.EVERY_15M,
    EVERY_30M: Frequency.EVERY_30M,
    EVERY_1H: Frequency.EVERY_1H,
    EVERY_2H: Frequency.EVERY_2H,
    EVERY_3H: Frequency.EVERY_3H,
    EVERY_6H: Frequency.EVERY_6H,
    EVERY_12H: Frequency.EVERY_12H,
    EVERY_24H: Frequency.EVERY_24H,
  }

  for (const [shortcut, definition] of Object.entries(predefined)) {
    if (frequency.frequency !== definition.frequency) {
      continue
    }

    if (frequency.frequencyOffset !== definition.frequencyOffset) {
      continue
    }

    return expr(ident('Frequency'), builder => {
      builder.member(ident(shortcut))
    })
  }

  return expr(ident('Frequency'), builder => {
    builder.new(builder => {
      builder.number(frequency.frequency)

      if (frequency.frequencyOffset) {
        builder.number(frequency.frequencyOffset)
      }
    })
  })
}
