import { describe, expect, it } from 'vitest'

import { ConstructCodegen } from '../construct-codegen.js'
import { Codegen, Context, ConstructRenderError, renderConstruct } from '../internal/codegen/index.js'
import { Program, expr, ident, lineComment } from '../../sourcegen/index.js'

/**
 * A program and a codegen per render, which is what a caller comparing two
 * versions of a resource has to do: a context hands out `my-check-2` the
 * second time it is asked for a path, and that path reaches the construct.
 */
const side = () => {
  const program = new Program({
    rootDirectory: '.',
    constructFileSuffix: '.check',
    specFileSuffix: '.spec',
    language: 'typescript',
  })
  return { program, codegen: new ConstructCodegen(program), context: new Context() }
}

const apiCheck = (name: string) => ({
  type: 'check' as const,
  logicalId: 'my-check',
  payload: {
    id: 'my-check',
    checkType: 'API',
    name,
    activated: true,
    locations: ['eu-west-1'],
    request: {
      url: 'https://api.example.com/health',
      method: 'GET',
      followRedirects: true,
      skipSSL: false,
      assertions: [],
    },
  },
})

describe('renderConstruct()', () => {
  it('renders a construct with no file or import scaffolding', () => {
    const { codegen, context } = side()

    const source = renderConstruct(codegen, 'my-check', apiCheck('Health'), { context })

    expect(source).toContain('new ApiCheck(')
    expect(source).toContain(`name: 'Health'`)
    // The imports and the generated-file header belong to a file on disk, not
    // to the construct, and an import path invented in memory is noise.
    expect(source).not.toContain('import')
    expect(source.startsWith('\n')).toBe(false)
  })

  it('renders the same resource identically twice', () => {
    const first = renderConstruct(side().codegen, 'my-check', apiCheck('Health'))
    const second = renderConstruct(side().codegen, 'my-check', apiCheck('Health'))

    expect(second).toEqual(first)
  })

  it('differs only where the resource differs', () => {
    const before = renderConstruct(side().codegen, 'my-check', apiCheck('Health'))
    const after = renderConstruct(side().codegen, 'my-check', apiCheck('Liveness'))

    expect(before).not.toEqual(after)
    expect(before.replace(`'Health'`, `'Liveness'`)).toEqual(after)
  })

  it('resolves a reference to the variable the context names', () => {
    const { program, codegen, context } = side()
    // A referenced group is registered against a support file, so it is not
    // mistaken for the construct being rendered.
    context.registerCheckGroup(42, 'Website Group', program.generatedSupportFile('groups'))

    const source = renderConstruct(codegen, 'my-check', {
      ...apiCheck('Health'),
      payload: { ...apiCheck('Health').payload, groupId: 42 },
    }, { context })

    expect(source).toContain('group: websiteGroup')
  })

  it('falls back to fromId for a reference the context does not know', () => {
    const { codegen, context } = side()

    const source = renderConstruct(codegen, 'my-check', {
      ...apiCheck('Health'),
      payload: { ...apiCheck('Health').payload, groupId: 42 },
    }, { context })

    expect(source).toContain('CheckGroupV2.fromId(42)')
  })

  it('throws ConstructRenderError when the codegen writes no construct file', () => {
    const { program, codegen, context } = side()
    // Subscriptions are folded into their parent and generate nothing of
    // their own, so there is no construct to return.
    expect(() => renderConstruct(codegen, 'sub', {
      type: 'alert-channel-subscription' as const,
      logicalId: 'sub',
      payload: { alertChannelId: 1, checkId: 'my-check' },
    }, { context })).toThrow(ConstructRenderError)
    expect(program.generatedConstructFiles).toHaveLength(0)
  })

  it('leaves a check script out, since the codegen writes it to its own file', () => {
    // The contract a diffing caller depends on: a script change is invisible
    // here, so equal renders mean "nothing to show", not "nothing changed".
    const browserCheck = (script: string) => ({
      type: 'check' as const,
      logicalId: 'login',
      payload: { id: 'login', checkType: 'BROWSER', name: 'Login', script },
    })

    const before = renderConstruct(side().codegen, 'login', browserCheck('await page.goto("/a")'))
    const after = renderConstruct(side().codegen, 'login', browserCheck('await page.goto("/b")'))

    expect(before).toEqual(after)
    expect(before).toContain('entrypoint')
    expect(before).not.toContain('page.goto')
  })

  it('suppresses the generated-file header as well as the imports', () => {
    // The default program has no construct headers, so the header half of the
    // scaffolding switch needs a program that asks for one.
    const program = new Program({
      rootDirectory: '.',
      constructFileSuffix: '.check',
      specFileSuffix: '.spec',
      language: 'typescript',
      constructHeaders: [lineComment('Generated by checkly import')],
    })

    const source = renderConstruct(new ConstructCodegen(program), 'my-check', apiCheck('Health'))

    expect(source).not.toContain('Generated by checkly import')
    expect(source.startsWith('new ApiCheck(')).toBe(true)
  })

  it('throws ConstructRenderError when the codegen writes more than one construct file', () => {
    const { program } = side()
    class TwoFileCodegen extends Codegen<{ name: string }> {
      describe = () => 'two files'
      gencode (logicalId: string) {
        for (const suffix of ['a', 'b']) {
          this.program
            .generatedConstructFile(`resources/${logicalId}-${suffix}`)
            .section(expr(ident('Thing'), builder => builder.new(builder => builder.string(logicalId))))
        }
      }
    }

    expect(() => renderConstruct(new TwoFileCodegen(program), 'thing', { name: 'Thing' }))
      .toThrow(/produced 2 construct files/)
  })

  it('propagates the codegen error for an unsupported resource type', () => {
    const { codegen } = side()

    expect(() => renderConstruct(codegen, 'suite', {
      type: 'check' as const,
      logicalId: 'suite',
      payload: { id: 'suite', checkType: 'NOPE', name: 'Suite' },
    })).toThrow(/unsupported check type 'NOPE'/)
  })
})

describe('Program.generatedConstructFiles', () => {
  it('lists construct files and leaves support and static files out', () => {
    const { program } = side()

    const construct = program.generatedConstructFile('resources/api-checks/health')
    program.generatedSupportFile('resources/api-checks/setup-script')
    program.staticSpecFile('resources/browser-checks/login', 'test()')

    expect(program.generatedConstructFiles).toEqual([construct])
  })

  it('does not list the same construct file twice', () => {
    const { program } = side()

    program.generatedConstructFile('resources/api-checks/health')
    program.generatedConstructFile('resources/api-checks/health')

    expect(program.generatedConstructFiles).toHaveLength(1)
  })
})
