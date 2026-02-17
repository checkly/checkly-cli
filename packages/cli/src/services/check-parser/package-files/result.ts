export interface Result<T, E = Error> {
  /**
   * Returns `true` if the {@link Result} is {@link Ok}, or `false` otherwise.
   */
  isOk (): this is Ok<T, E>

  /**
   * Returns `true` if the {@link Result} is {@link Err}, or `false` otherwise.
   */
  isErr (): this is Err<T, E>

  /**
   * Returns `T` if the {@link Result} is {@link Ok}, or throws `E` otherwise.
   */
  unwrap (): T

  /**
   * Returns `T` if the {@link Result} is {@link Ok}, or `undefined` otherwise.
   */
  ok (): T | undefined

  /**
   * Returns `E` if the {@link Result} is {@link Err}, or `undefined` otherwise.
   */
  err (): E | undefined
}

export interface Ok<T, E = Error> extends Result<T, E> {
  isOk (): this is Ok<T, E>
  isErr (): this is Err<T, E>
  unwrap (): T
  ok (): T
  err (): undefined
}

export interface Err<T, E = Error> extends Result<T, E> {
  isOk (): this is Ok<T, E>
  isErr (): this is Err<T, E>
  unwrap (): never
  ok (): undefined
  err (): E
}

export function Ok<T, E = Error> (value: T): Result<T, E> {
  return new _Ok(value)
}

export function Err<T, E = Error> (error: E): Result<T, E> {
  return new _Err(error)
}

abstract class _Result<T, E = Error> implements Result<T, E> {
  abstract isOk (): this is Ok<T, E>
  abstract isErr (): this is Err<T, E>
  abstract unwrap (): T
  abstract ok (): T | undefined
  abstract err (): E | undefined
}

class _Ok<T, E = Error> extends _Result<T, E> implements Ok<T, E> {
  #value: T

  constructor (value: T) {
    super()
    this.#value = value
  }

  isOk (): this is Ok<T, E> {
    return true
  }

  isErr (): this is Err<T, E> {
    return false
  }

  unwrap (): T {
    return this.#value
  }

  ok (): T {
    return this.#value
  }

  err (): undefined {
    return
  }
}

class _Err<T, E = Error> extends _Result<T, E> implements Err<T, E> {
  #error: E

  constructor (error: E) {
    super()
    this.#error = error
  }

  isOk (): this is Ok<T, E> {
    return false
  }

  isErr (): this is Err<T, E> {
    return true
  }

  unwrap (): never {
    throw this.#error
  }

  ok (): undefined {
    return
  }

  err (): E {
    return this.#error
  }
}
