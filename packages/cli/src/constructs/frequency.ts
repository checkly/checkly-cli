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
  static EVERY_3M = new Frequency(3 * 60)
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
