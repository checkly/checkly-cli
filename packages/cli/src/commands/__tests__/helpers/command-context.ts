import { vi } from 'vitest'

import { CommandStyle } from '../../../helpers/command-style.js'

type Mock = ReturnType<typeof vi.fn>

export interface CommandContextOptions {
  /**
   * The command class. The context inherits from its prototype, so real
   * methods (`confirmOrAbort`, `validateProject`, `notFoundHint`, …) and
   * `this.constructor` statics behave as on a real instance.
   */
  command?: abstract new (...args: any[]) => unknown
  /**
   * What `parse()` resolves to, merged over empty `args`, `flags` and
   * `metadata.flags`.
   */
  parsed?: Record<string, unknown>
  /** Replacements for members of the mocked `style`. */
  style?: Record<string, unknown>
  /**
   * Extra or replacement members. Copied as property descriptors, so a getter
   * stays a getter and can shadow one on the prototype (e.g. `account`).
   */
  members?: Record<string, unknown>
}

/**
 * Builds a `this` for calling a command's methods directly
 * (`Command.prototype.run.call(ctx)`) without oclif's constructor.
 *
 * stdout and stderr lines are captured in `logged` and `loggedToStderr`
 * (empty lines are dropped), `exit(code)` records `exitCodeValue` and throws
 * `EXIT_<code>`, `error(message)` throws, and every CommandStyle method is a
 * mock. Each call returns fresh objects and mocks, since commands write to
 * `this.style`.
 */
export function createCommandContext (options: CommandContextOptions = {}) {
  const logged: string[] = []
  const loggedToStderr: string[] = []
  let exitCodeValue: number | undefined

  // Own enumerable properties, so spreading the context keeps them.
  const base = {
    parse: vi.fn().mockResolvedValue({
      args: {},
      flags: {},
      metadata: { flags: {} },
      ...options.parsed,
    }),
    log: vi.fn((message?: string) => {
      if (message) logged.push(message)
    }),
    logToStderr: vi.fn((message?: string) => {
      if (message) loggedToStderr.push(message)
    }),
    exit: vi.fn((code: number) => {
      exitCodeValue = code
      throw new Error(`EXIT_${code}`)
    }),
    error: vi.fn((message: string) => {
      throw new Error(message)
    }),
    // AuthCommand's real searchedAccount() and account getter read a private
    // field, which throws on a context that was not built by the constructor.
    searchedAccount: vi.fn(),
    style: {
      ...Object.fromEntries(
        Object.getOwnPropertyNames(CommandStyle.prototype)
          .filter(name => name !== 'constructor')
          .map(name => [name, vi.fn()]),
      ),
      outputFormat: undefined as string | undefined,
      ...options.style,
    } as Record<string, any> & { outputFormat: string | undefined },
    logged,
    loggedToStderr,
    get exitCodeValue () {
      return exitCodeValue
    },
  }

  const context = Object.create(options.command?.prototype ?? Object.prototype)
  Object.defineProperties(context, Object.getOwnPropertyDescriptors(base))
  if (options.members) {
    Object.defineProperties(context, Object.getOwnPropertyDescriptors(options.members))
  }
  return context as typeof base & Record<string, any> & {
    parse: Mock
    log: Mock
    logToStderr: Mock
    exit: Mock
    error: Mock
  }
}
