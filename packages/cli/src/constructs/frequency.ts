/**
 * Represents a check execution frequency with optional offset.
 * Use the static constants for common scheduling patterns.
 *
 * @example
 * ```typescript
 * // High-frequency monitoring (every 30 seconds) - API/TCP only
 * frequency: Frequency.EVERY_30S
 *
 * // Standard API monitoring (every 5 minutes)
 * frequency: Frequency.EVERY_5M
 *
 * // Daily health checks (every 24 hours)
 * frequency: Frequency.EVERY_24H
 * ```
 *
 * @see {@link https://www.checklyhq.com/docs/detect/synthetic-monitoring/overview/ | Monitoring Documentation}
 */
export class Frequency {
  /** Run every 10 seconds */
  static EVERY_10S = new Frequency(0, 10)
  /** Run every 20 seconds */
  static EVERY_20S = new Frequency(0, 20)
  /** Run every 30 seconds */
  static EVERY_30S = new Frequency(0, 30)

  /** Run every 1 minute */
  static EVERY_1M = new Frequency(1)
  /** Run every 2 minutes */
  static EVERY_2M = new Frequency(2)
  /** Run every 5 minutes */
  static EVERY_5M = new Frequency(5)
  /** Run every 10 minutes */
  static EVERY_10M = new Frequency(10)
  /** Run every 15 minutes */
  static EVERY_15M = new Frequency(15)
  /** Run every 30 minutes */
  static EVERY_30M = new Frequency(30)

  /** Run every 1 hour */
  static EVERY_1H = new Frequency(1 * 60)
  /** Run every 2 hours */
  static EVERY_2H = new Frequency(2 * 60)
  /** Run every 3 hours */
  static EVERY_3H = new Frequency(3 * 60)
  /** Run every 6 hours */
  static EVERY_6H = new Frequency(6 * 60)
  /** Run every 12 hours */
  static EVERY_12H = new Frequency(12 * 60)
  /** Run every 24 hours */
  static EVERY_24H = new Frequency(24 * 60)

  /** The frequency in minutes (or 0 for second-based frequencies) */
  frequency: number
  /** The frequency offset in seconds (used for sub-minute frequencies) */
  frequencyOffset?: number

  /**
   * Creates a new frequency instance.
   * Prefer the static constants; the constructor is for a schedule none of
   * them spell and for code generated from an existing check that holds
   * one. The platform accepts sub-minute offsets of 10, 20 and 30 seconds,
   * which the constants cover; any other value is refused on deploy.
   *
   * @param frequency The frequency in minutes, or 0 for second-based frequencies
   * @param frequencyOffset The frequency offset in seconds, honoured only for
   * sub-minute frequencies (frequency 0); for a minute-level frequency the
   * backend assigns a scheduling offset of its own and this one is ignored
   */
  constructor (frequency: number, frequencyOffset?: number) {
    this.frequency = frequency
    this.frequencyOffset = frequencyOffset
  }
}
