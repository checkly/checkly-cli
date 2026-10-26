import { describe, expect, it, vi } from 'vitest'

import { CommandStyle } from '../../../helpers/command-style.js'
import { createCommandContext } from './command-context.js'

class Base {
  static id = 'base'
  get account (): string {
    throw new Error('real getter')
  }

  greet () {
    return `hello from ${(this.constructor as typeof Base).id}`
  }
}

class Child extends Base {
  static id = 'child'
}

describe('createCommandContext', () => {
  it('resolves parse() with the parsed result over empty defaults', async () => {
    const ctx = createCommandContext({ parsed: { flags: { force: true } } })

    await expect(ctx.parse()).resolves.toEqual({
      args: {},
      flags: { force: true },
      metadata: { flags: {} },
    })
  })

  it('captures non-empty stdout and stderr lines separately', () => {
    const ctx = createCommandContext()

    ctx.log('result')
    ctx.log('')
    ctx.logToStderr('note')
    ctx.logToStderr()

    expect(ctx.logged).toEqual(['result'])
    expect(ctx.loggedToStderr).toEqual(['note'])
  })

  it('records the exit code and throws', () => {
    const ctx = createCommandContext()

    expect(ctx.exitCodeValue).toBeUndefined()
    expect(() => ctx.exit(2)).toThrow('EXIT_2')
    expect(ctx.exitCodeValue).toBe(2)
  })

  it('throws from error()', () => {
    const ctx = createCommandContext()

    expect(() => ctx.error('boom')).toThrow('boom')
  })

  it('mocks every CommandStyle method', () => {
    const ctx = createCommandContext()
    const methods = Object.getOwnPropertyNames(CommandStyle.prototype).filter(name => name !== 'constructor')

    expect(methods).toContain('longError')
    for (const method of methods) {
      expect(vi.isMockFunction(ctx.style[method]), method).toBe(true)
    }
  })

  it('merges style overrides', () => {
    const custom = () => 'custom'
    const ctx = createCommandContext({ style: { outputFormat: 'json', diagnostics: custom } })

    expect(ctx.style.outputFormat).toBe('json')
    expect(ctx.style.diagnostics).toBe(custom)
    ctx.style.longError('title', 'message')
    expect(ctx.style.longError).toHaveBeenCalledWith('title', 'message')
  })

  it('returns fresh objects and mocks on every call', () => {
    const first = createCommandContext()
    const second = createCommandContext()

    first.style.outputFormat = 'json'

    expect(second.style.outputFormat).toBeUndefined()
    expect(second.log).not.toBe(first.log)
  })

  it('inherits methods and statics from the command class', () => {
    const ctx = createCommandContext({ command: Child })

    expect(ctx).toBeInstanceOf(Child)
    expect(ctx.greet()).toBe('hello from child')
  })

  it('lets members shadow prototype getters', () => {
    const ctx = createCommandContext({ command: Child, members: { account: { name: 'Test' } } })

    expect(ctx.account).toEqual({ name: 'Test' })
  })

  it('keeps getters in members live', () => {
    let value = 1
    const ctx = createCommandContext({
      members: {
        get current () {
          return value
        },
      },
    })

    value = 2

    expect(ctx.current).toBe(2)
  })

  it('keeps the base members when spread', () => {
    const ctx = createCommandContext()
    const spread = { ...ctx }

    spread.log('result')

    expect(ctx.logged).toEqual(['result'])
    expect(typeof spread.exit).toBe('function')
    expect(spread.style).toBe(ctx.style)
  })
})
