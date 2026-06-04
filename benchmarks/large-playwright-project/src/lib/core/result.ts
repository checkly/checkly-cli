export type Result<T, E = Error> =
  | { ok: true, value: T }
  | { ok: false, error: E }

export function ok<T> (value: T): Result<T, never> {
  return { ok: true, value }
}

export function err<E> (error: E): Result<never, E> {
  return { ok: false, error }
}

export function map<T, U, E> (result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return result.ok ? ok(fn(result.value)) : result
}

export function unwrap<T, E> (result: Result<T, E>): T {
  if (!result.ok) {
    throw result.error instanceof Error ? result.error : new Error(String(result.error))
  }
  return result.value
}
