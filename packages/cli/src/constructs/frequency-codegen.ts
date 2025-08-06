import { expr, GeneratedFile, ident, Value } from '../sourcegen'
import { Frequency } from './frequency'

interface FrequencyLike {
  frequency: number
  frequencyOffset?: number
}

export type FrequencyResource = FrequencyLike | number

export function valueForFrequency (genfile: GeneratedFile, frequency: FrequencyResource): Value {
  if (typeof frequency === 'number') {
    return valueForFrequency(genfile, {
      frequency,
    })
  }

  genfile.namedImport('Frequency', 'checkly/constructs')

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

    // If the definition has no offset, a random value has almost certainly
    // been generated for it. Just ignore the offset.
    if (definition.frequencyOffset !== undefined) {
      if (frequency.frequencyOffset !== definition.frequencyOffset) {
        continue
      }
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
