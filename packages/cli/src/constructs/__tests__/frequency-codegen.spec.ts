import { describe, it, expect } from 'vitest'

import { Frequency } from '../frequency'
import { valueForFrequency } from '../frequency-codegen'
import { GeneratedFile, Output } from '../../sourcegen'

describe('Frequency Codegen', () => {
  it('should generate predefined constants', () => {
    const predefined = [
      { input: Frequency.EVERY_10S, expected: 'Frequency.EVERY_10S\n' },
      { input: Frequency.EVERY_20S, expected: 'Frequency.EVERY_20S\n' },
      { input: Frequency.EVERY_30S, expected: 'Frequency.EVERY_30S\n' },
      { input: Frequency.EVERY_1M, expected: 'Frequency.EVERY_1M\n' },
      { input: Frequency.EVERY_2M, expected: 'Frequency.EVERY_2M\n' },
      { input: Frequency.EVERY_5M, expected: 'Frequency.EVERY_5M\n' },
      { input: Frequency.EVERY_10M, expected: 'Frequency.EVERY_10M\n' },
      { input: Frequency.EVERY_15M, expected: 'Frequency.EVERY_15M\n' },
      { input: Frequency.EVERY_30M, expected: 'Frequency.EVERY_30M\n' },
      { input: Frequency.EVERY_1H, expected: 'Frequency.EVERY_1H\n' },
      { input: Frequency.EVERY_2H, expected: 'Frequency.EVERY_2H\n' },
      { input: Frequency.EVERY_3H, expected: 'Frequency.EVERY_3H\n' },
      { input: Frequency.EVERY_6H, expected: 'Frequency.EVERY_6H\n' },
      { input: Frequency.EVERY_12H, expected: 'Frequency.EVERY_12H\n' },
      { input: Frequency.EVERY_24H, expected: 'Frequency.EVERY_24H\n' },
    ]

    for (const test of predefined) {
      const output = new Output()
      const file = new GeneratedFile('foo.ts')
      const result = valueForFrequency(file, test.input)
      result.render(output)
      expect(output.finalize()).toEqual(test.expected)
    }
  })

  it('should generate predefined constants for equivalent values', () => {
    const predefined = [
      { input: { frequency: 0, frequencyOffset: 10 }, expected: 'Frequency.EVERY_10S\n' },
      { input: { frequency: 1 }, expected: 'Frequency.EVERY_1M\n' },
      { input: { frequency: 720 }, expected: 'Frequency.EVERY_12H\n' },
    ]

    for (const test of predefined) {
      const output = new Output()
      const file = new GeneratedFile('foo.ts')
      const result = valueForFrequency(file, test.input)
      result.render(output)
      expect(output.finalize()).toEqual(test.expected)
    }
  })

  it('should ignore frequencyOffset if undefined in predefined value', () => {
    const predefined = [
      { input: { frequency: 0, frequencyOffset: 10 }, expected: 'Frequency.EVERY_10S\n' },
      { input: { frequency: 1, frequencyOffset: 12 }, expected: 'Frequency.EVERY_1M\n' },
      { input: { frequency: 720, frequencyOffset: 45 }, expected: 'Frequency.EVERY_12H\n' },
      { input: { frequency: 1440, frequencyOffset: 15 }, expected: 'Frequency.EVERY_24H\n' },
    ]

    for (const test of predefined) {
      const output = new Output()
      const file = new GeneratedFile('foo.ts')
      const result = valueForFrequency(file, test.input)
      result.render(output)
      expect(output.finalize()).toEqual(test.expected)
    }
  })

  it('should generate constructor call for non-predefined values', () => {
    const predefined = [
      { input: { frequency: 123 }, expected: 'new Frequency(123)\n' },
      { input: { frequency: 123, frequencyOffset: 456 }, expected: 'new Frequency(123, 456)\n' },
    ]

    for (const test of predefined) {
      const output = new Output()
      const file = new GeneratedFile('foo.ts')
      const result = valueForFrequency(file, test.input)
      result.render(output)
      expect(output.finalize()).toEqual(test.expected)
    }
  })

  it('should generate predefined constants for equivalent number value', () => {
    const predefined = [
      { input: 1, expected: 'Frequency.EVERY_1M\n' },
      { input: 5, expected: 'Frequency.EVERY_5M\n' },
      { input: 1440, expected: 'Frequency.EVERY_24H\n' },
    ]

    for (const test of predefined) {
      const output = new Output()
      const file = new GeneratedFile('foo.ts')
      const result = valueForFrequency(file, test.input)
      result.render(output)
      expect(output.finalize()).toEqual(test.expected)
    }
  })
})
