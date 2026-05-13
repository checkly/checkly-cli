/**
 * Sanitizes a value that may be a number or a numeric string.
 *
 * If `value` is a `number`, it is returned as-is.
 *
 * If `value` is a numeric `string`, it is converted into a number before
 * being returned.
 *
 * Is `value` is of any other type, or a non-numeric string, it is returned
 * as-is so that it can be validated separately.
 *
 * @param value The number or numeric string.
 * @returns
 */
export function sanitizeNumericString (value: number | string): number | string {
  switch (typeof value) {
    case 'string': {
      if (value === '') {
        return value
      }
      const n = Number(value)
      if (isInteger(n)) {
        return n
      }
      return value
    }
    case 'number':
      return value
    default:
      return value
  }
}

function isInteger (n: number): boolean {
  return Number.isFinite(n) && Math.floor(n) === n
}
