import { expr, ident, NumberValue, Program, Value } from '../sourcegen'

export class Frequency {
  static EVERY_10S = new Frequency(0, 10)
  static EVERY_20S = new Frequency(0, 20)
  static EVERY_30S = new Frequency(0, 30)

  static EVERY_1M = new Frequency(1)
  static EVERY_2M = new Frequency(2)
  static EVERY_5M = new Frequency(5)
  static EVERY_10M = new Frequency(10)
  static EVERY_15M = new Frequency(15)
  static EVERY_30M = new Frequency(30)

  static EVERY_1H = new Frequency(1 * 60)
  static EVERY_2H = new Frequency(2 * 60)
  static EVERY_3H = new Frequency(3 * 60)
  static EVERY_6H = new Frequency(6 * 60)
  static EVERY_12H = new Frequency(12 * 60)
  static EVERY_24H = new Frequency(24 * 60)

  frequency: number
  frequencyOffset?: number
  private constructor (frequency: number, frequencyOffset?: number) {
    this.frequency = frequency
    this.frequencyOffset = frequencyOffset
  }
}

export function sourceForFrequency (program: Program, frequency: Frequency | number): Value {
  if (typeof frequency === 'number') {
    return new NumberValue(frequency)
  }

  program.import('Frequency', 'checkly/constructs')

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
