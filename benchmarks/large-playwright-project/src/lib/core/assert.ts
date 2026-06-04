import { err, ok, Result } from './result'

export function assertDefined<T> (value: T | undefined | null, name: string): Result<T> {
  if (value === undefined || value === null) {
    return err(new Error(`Expected ${name} to be defined`))
  }
  return ok(value)
}

export function assertRange (value: number, min: number, max: number, name: string): Result<number> {
  if (value < min || value > max) {
    return err(new Error(`Expected ${name} to be within [${min}, ${max}], got ${value}`))
  }
  return ok(value)
}

export function assertNonEmpty (value: string, name: string): Result<string> {
  if (value.trim().length === 0) {
    return err(new Error(`Expected ${name} to be non-empty`))
  }
  return ok(value)
}
