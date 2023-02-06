const HIGH_FREQ_OFFSETS = [10, 20, 30]
type Second = typeof HIGH_FREQ_OFFSETS[number]

const MIN_FREQS = [1, 2, 5, 10, 15, 30]
type Minute = typeof MIN_FREQS[number]

const HOUR_FREQS = [1, 2, 3, 6, 12, 24]
type Hour = typeof HOUR_FREQS[number]

export class Frequency {
  frequency: number
  frequencyOffset?: number
  private constructor (frequency: number, frequencyOffset?: number) {
    this.frequency = frequency
    this.frequencyOffset = frequencyOffset
  }

  everySecond (freq: Second) {
    if (!HIGH_FREQ_OFFSETS.includes(freq)) {
      throw new Error(`Unsupproted freq ${freq}`)
    }
    return new Frequency(0, freq)
  }

  everyMinute (freq: Minute) {
    if (!MIN_FREQS.includes(freq)) {
      throw new Error(`Unsupproted freq ${freq}`)
    }
    return new Frequency(freq)
  }

  everyHour (freq: Hour) {
    if (!HOUR_FREQS.includes(freq)) {
      throw new Error(`Unsupproted freq ${freq}`)
    }
    return new Frequency(freq * 60)
  }
}
