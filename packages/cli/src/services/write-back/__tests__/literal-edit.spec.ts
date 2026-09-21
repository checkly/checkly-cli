import { describe, expect, it } from 'vitest'

import { applyLiteralEdits, detectStyle, evaluateLiteral, isPlainLiteral, resolvePath } from '../literal-edit.js'
import { findConstructOptions, parseSource, WriteBackSkipped } from '../source-file.js'

/**
 * The rewriter (`source-file.ts`, `literal-edit.ts`): finding the construct
 * call, deciding what may be replaced, and splicing rendered values in so
 * that nothing else in the file moves.
 */

const NAMES = new Set(['ApiCheck'])

function options (file: string, text: string, logicalId = 'api') {
  return findConstructOptions(parseSource(file, text), logicalId, NAMES)
}

function edit (file: string, text: string, edits: { path: string[], value: unknown }[], logicalId = 'api') {
  const source = parseSource(file, text)
  return applyLiteralEdits(source, findConstructOptions(source, logicalId, NAMES), edits)
}

/** Whether the edited text still parses and holds `value` at `path`, checked with the same parser. */
function readsBack (file: string, text: string, path: string[], value: unknown): boolean {
  const resolution = resolvePath(options(file, text), path)
  return resolution.kind === 'found' && JSON.stringify(evaluateLiteral(resolution.node)) === JSON.stringify(value)
}

const TS = `import { ApiCheck, Frequency } from 'checkly/constructs'

const shared: string[] = ['eu-west-1']

new ApiCheck('api', {
  name: 'API',
  activated: true,
  tags: ['a', 'b'],
  locations: shared,
  frequency: Frequency.EVERY_5M,
  request: {
    url: 'https://example.com',
    method: 'GET',
    headers: [
      { key: 'x-a', value: '1' },
    ],
  },
  degradedResponseTime: 5000,
})
`

describe('findConstructOptions', () => {
  it('finds the call through a named import, an alias and a require', () => {
    expect(options('a.ts', TS).type).toBe('ObjectExpression')
    const aliased = `import { ApiCheck as Api } from 'checkly'\nnew Api('api', { name: 'x' })\n`
    expect(options('a.ts', aliased).properties).toHaveLength(1)
    const required = `const { ApiCheck } = require('checkly/constructs')\nnew ApiCheck('api', { name: 'x' })\n`
    expect(options('a.js', required).properties).toHaveLength(1)
    const renamed = `const { ApiCheck: Api } = require('checkly/constructs')\nnew Api(\`api\`, { name: 'x' })\n`
    expect(options('a.cjs', renamed).properties).toHaveLength(1)
  })

  it('does not match a class that is not imported from checkly', () => {
    const own = `import { ApiCheck } from './my-checks'\nnew ApiCheck('api', { name: 'x' })\n`
    expect(() => options('a.ts', own)).toThrow(/is not imported from checkly/)
    const local = `class ApiCheck {}\nnew ApiCheck('api', { name: 'x' })\n`
    expect(() => options('a.js', local)).toThrow(/is not imported from checkly/)
  })

  it('refuses a missing, duplicated or non-literal call', () => {
    expect(() => options('a.ts', TS, 'other')).toThrow(/no `new ApiCheck\('other', …\)` found/)
    const twice = `import { ApiCheck } from 'checkly/constructs'\nnew ApiCheck('api', { name: 'x' })\nnew ApiCheck('api', { name: 'y' })\n`
    expect(() => options('a.ts', twice)).toThrow(/several constructs use the logical id 'api'/)
    const variable = `import { ApiCheck } from 'checkly/constructs'\nconst opts = { name: 'x' }\nnew ApiCheck('api', opts)\n`
    expect(() => options('a.ts', variable)).toThrow(/not a plain object literal/)
    const spread = `import { ApiCheck } from 'checkly/constructs'\nnew ApiCheck('api', { ...base, name: 'x' })\n`
    expect(() => options('a.ts', spread)).toThrow(/spread another object/)
    const satisfies = `import { ApiCheck } from 'checkly/constructs'\nnew ApiCheck('api', { name: 'x' } satisfies object)\n`
    expect(() => options('a.ts', satisfies)).toThrow(/not a plain object literal/)
    const dynamicId = `import { ApiCheck } from 'checkly/constructs'\nfor (const id of ids) new ApiCheck(id, { name: 'x' })\n`
    expect(() => options('a.ts', dynamicId)).toThrow(/no `new ApiCheck\('api', …\)` found/)
  })

  it('reads every supported extension and refuses others', () => {
    const js = `const { ApiCheck } = require('checkly')\nnew ApiCheck('api', { name: 'x' })\n`
    for (const file of ['a.js', 'a.mjs', 'a.cjs']) {
      expect(options(file, js).properties).toHaveLength(1)
    }
    const ts = `import { ApiCheck } from 'checkly'\nnew ApiCheck<string>('api', { name: 'x' as string })\n`
    for (const file of ['a.ts', 'a.mts', 'a.cts', 'a.tsx']) {
      expect(options(file, ts).properties).toHaveLength(1)
    }
    const esm = `import { ApiCheck } from 'checkly'\nexport const check = new ApiCheck('api', { name: 'x' })\n`
    expect(options('a.mjs', esm).properties).toHaveLength(1)
    expect(() => parseSource('a.json', '{}')).toThrow(/is not a JavaScript or TypeScript file/)
    expect(() => parseSource('a.ts', 'new (')).toThrow(/could not parse the file/)
    expect(() => parseSource('a.js', 'new (')).toThrow(WriteBackSkipped)
  })
})

describe('resolvePath', () => {
  const node = options('a.ts', TS)

  it('finds plain literals at any depth', () => {
    expect(resolvePath(node, ['name'])).toMatchObject({ kind: 'found' })
    expect(resolvePath(node, ['request', 'url'])).toMatchObject({ kind: 'found' })
    expect(resolvePath(node, ['request', 'headers'])).toMatchObject({ kind: 'found' })
    expect(resolvePath(node, ['request', 'headers', '0', 'value'])).toMatchObject({ kind: 'found' })
  })

  it('reports a missing last key and refuses a missing parent', () => {
    expect(resolvePath(node, ['muted'])).toMatchObject({ kind: 'missing', key: 'muted' })
    expect(resolvePath(node, ['request', 'body'])).toMatchObject({ kind: 'missing', key: 'body' })
    expect(resolvePath(node, ['heartbeat', 'period'])).toMatchObject({ kind: 'unsupported', reason: 'heartbeat is not set in the code' })
  })

  it('refuses positions that are not plain literals', () => {
    expect(resolvePath(node, ['frequency'])).toMatchObject({ kind: 'unsupported', reason: 'frequency is Frequency.EVERY_5M, not a plain literal' })
    expect(resolvePath(node, ['locations'])).toMatchObject({ kind: 'unsupported', reason: 'locations is the variable shared, not a plain literal' })
    expect(resolvePath(node, ['locations', '0'])).toMatchObject({ kind: 'unsupported', reason: 'locations is the variable shared, not an object literal' })
    const source = `import { ApiCheck } from 'checkly'\nconst name = 'x'\nnew ApiCheck('api', { name, description: null, tags: [\`\${a}\`], request: { url: url(), assertions: [AssertionBuilder.statusCode().equals(200)] }, twice: 1, twice: 2 })\n`
    const dodgy = options('a.ts', source)
    expect(resolvePath(dodgy, ['name'])).toMatchObject({ reason: 'name is the variable name, not a literal' })
    expect(resolvePath(dodgy, ['description'])).toMatchObject({ reason: 'description is null in the code; set a value by hand' })
    expect(resolvePath(dodgy, ['tags'])).toMatchObject({ reason: 'tags is an array with non-literal elements, not a plain literal' })
    expect(resolvePath(dodgy, ['request', 'url'])).toMatchObject({ reason: 'request.url is a function call, not a plain literal' })
    expect(resolvePath(dodgy, ['request', 'assertions'])).toMatchObject({ reason: /assertions is an array with non-literal elements/ })
    expect(resolvePath(dodgy, ['twice'])).toMatchObject({ reason: 'twice is set twice in the code' })
    const odd = `import { ApiCheck } from 'checkly'\nnew ApiCheck('api', { t: \`a\${b}\`, h: [1, , 2], r: /x/, request: { url: 'u', ...rest }, q: { url: 'u', ['url']: 'v' } })\n`
    const node2 = options('a.ts', odd)
    expect(resolvePath(node2, ['t', 'x'])).toMatchObject({ reason: 't is a template with expressions, not an object literal' })
    expect(resolvePath(node2, ['h'])).toMatchObject({ reason: 'h is an array with holes, not a plain literal' })
    expect(resolvePath(node2, ['r'])).toMatchObject({ reason: 'r is a regular expression, not a plain literal' })
    expect(resolvePath(node2, ['request', 'url'])).toMatchObject({ reason: 'url may be overridden by a later member' })
    expect(resolvePath(node2, ['q', 'url'])).toMatchObject({ reason: 'url may be overridden by a later member' })
  })

  it('evaluates what it accepts', () => {
    const source = `import { ApiCheck } from 'checkly'\nnew ApiCheck('api', { n: -1.5, s: \`plain\`, o: { 'a-b': [true, "x"] } })\n`
    const node = options('a.ts', source)
    for (const key of ['n', 's', 'o']) {
      const found = resolvePath(node, [key])
      expect(found.kind).toBe('found')
      expect(isPlainLiteral((found as { node: any }).node)).toBe(true)
    }
    expect(evaluateLiteral((resolvePath(node, ['n']) as any).node)).toBe(-1.5)
    expect(evaluateLiteral((resolvePath(node, ['s']) as any).node)).toBe('plain')
    expect(evaluateLiteral((resolvePath(node, ['o']) as any).node)).toEqual({ 'a-b': [true, 'x'] })
  })
})

describe('detectStyle', () => {
  const style = (file: string, text: string) => {
    const source = parseSource(file, text)
    return detectStyle(source, findConstructOptions(source, 'api', NAMES))
  }

  it('reads the quote, indent unit and line ending from the object', () => {
    expect(style('a.ts', TS)).toEqual({ quote: '\'', indentUnit: '  ', lineEnding: '\n' })
    const tabs = `import { ApiCheck } from 'checkly'\r\nnew ApiCheck("api", {\r\n\tname: "x",\r\n\ttags: ["a", 'b'],\r\n})\r\n`
    expect(style('a.ts', tabs)).toEqual({ quote: '"', indentUnit: '\t', lineEnding: '\r\n' })
  })

  it('falls back to the rest of the file for the quote when the object has no strings', () => {
    const inline = `import { ApiCheck } from "checkly"\nnew ApiCheck("api", { activated: true })\n`
    expect(style('a.ts', inline)).toEqual({ quote: '"', indentUnit: '  ', lineEnding: '\n' })
  })
})

describe('applyLiteralEdits', () => {
  it('replaces scalars and arrays in place and leaves everything else byte-identical', () => {
    const { text, applied, skipped } = edit('a.ts', TS, [
      { path: ['name'], value: 'API v2' },
      { path: ['activated'], value: false },
      { path: ['tags'], value: ['b', 'c', 'd'] },
      { path: ['request', 'url'], value: 'https://example.com/v2' },
      { path: ['degradedResponseTime'], value: 8000 },
    ])
    expect(skipped).toEqual([])
    expect(applied.map(a => [a.path.join('.'), a.previous, a.rendered])).toEqual([
      ['name', '\'API\'', '\'API v2\''],
      ['activated', 'true', 'false'],
      ['tags', '[\'a\', \'b\']', '[\'b\', \'c\', \'d\']'],
      ['request.url', '\'https://example.com\'', '\'https://example.com/v2\''],
      ['degradedResponseTime', '5000', '8000'],
    ])
    expect(text).toBe(TS
      .replace('\'API\'', '\'API v2\'')
      .replace('activated: true', 'activated: false')
      .replace('[\'a\', \'b\']', '[\'b\', \'c\', \'d\']')
      .replace('https://example.com\'', 'https://example.com/v2\'')
      .replace('5000', '8000'))
  })

  it('keeps a multi-line list multi-line, with the trailing comma the code used', () => {
    const { text } = edit('a.ts', TS, [
      { path: ['request', 'headers'], value: [{ key: 'x-a', value: '2' }, { key: 'x-b', value: '3' }] },
    ])
    expect(text).toContain(`    headers: [
      {
        key: 'x-a',
        value: '2',
      },
      {
        key: 'x-b',
        value: '3',
      },
    ],
  },`)
  })

  it('inserts missing properties after the last member of a multi-line object', () => {
    const { text, applied } = edit('a.ts', TS, [
      { path: ['muted'], value: true },
      { path: ['request', 'body'], value: '{"a":1}' },
      { path: ['request', 'queryParameters'], value: [{ key: 'q', value: 'v' }] },
    ])
    expect(applied.map(a => a.previous)).toEqual([undefined, undefined, undefined])
    expect(text).toContain(`  degradedResponseTime: 5000,
  muted: true,
})`)
    expect(text).toContain(`    headers: [
      { key: 'x-a', value: '1' },
    ],
    body: '{"a":1}',
    queryParameters: [
      {
        key: 'q',
        value: 'v',
      },
    ],
  },`)
  })

  it('adds a comma to a last member that has none, before a same-line comment', () => {
    const source = `import { ApiCheck } from 'checkly'
new ApiCheck('api', {
  name: 'x', // display name
  activated: true // on
})
`
    const { text } = edit('a.ts', source, [{ path: ['muted'], value: false }, { path: ['tags'], value: ['t'] }])
    expect(text).toBe(`import { ApiCheck } from 'checkly'
new ApiCheck('api', {
  name: 'x', // display name
  activated: true, // on
  muted: false,
  tags: ['t']
})
`)
  })

  it('inserts into one-line and empty objects', () => {
    const inline = `import { ApiCheck } from 'checkly'\nnew ApiCheck('api', { name: 'x' })\n`
    expect(edit('a.ts', inline, [{ path: ['muted'], value: true }]).text)
      .toBe(`import { ApiCheck } from 'checkly'\nnew ApiCheck('api', { name: 'x', muted: true })\n`)
    const trailing = `import { ApiCheck } from 'checkly'\nnew ApiCheck('api', { name: 'x', })\n`
    expect(edit('a.ts', trailing, [{ path: ['muted'], value: true }]).text)
      .toBe(`import { ApiCheck } from 'checkly'\nnew ApiCheck('api', { name: 'x', muted: true, })\n`)
    const empty = `import { ApiCheck } from 'checkly'\nnew ApiCheck('api', {})\n`
    expect(edit('a.ts', empty, [{ path: ['name'], value: 'x' }]).text)
      .toBe(`import { ApiCheck } from 'checkly'\nnew ApiCheck('api', { name: 'x' })\n`)
    expect(edit('a.ts', empty, [{ path: ['request'], value: { url: 'u', method: 'GET' } }]).text)
      .toBe(`import { ApiCheck } from 'checkly'\nnew ApiCheck('api', { request: { url: 'u', method: 'GET' } })\n`)
    const commented = `import { ApiCheck } from 'checkly'\nnew ApiCheck('api', {\n  // nothing yet\n})\n`
    expect(edit('a.ts', commented, [{ path: ['name'], value: 'x' }, { path: ['tags'], value: [] }]).text)
      .toBe(`import { ApiCheck } from 'checkly'\nnew ApiCheck('api', {\n  name: 'x',\n  tags: [],\n  // nothing yet\n})\n`)
    const padded = `import { ApiCheck } from 'checkly'\nnew ApiCheck('api', { /* none */ })\n`
    expect(edit('a.ts', padded, [{ path: ['muted'], value: true }]).text)
      .toBe(`import { ApiCheck } from 'checkly'\nnew ApiCheck('api', { muted: true, /* none */ })\n`)
    const spaced = `import { ApiCheck } from 'checkly'\nnew ApiCheck('api', {  })\n`
    expect(edit('a.ts', spaced, [{ path: ['muted'], value: true }]).text)
      .toBe(`import { ApiCheck } from 'checkly'\nnew ApiCheck('api', { muted: true })\n`)
    const blankLines = `import { ApiCheck } from 'checkly'\nnew ApiCheck('api', {\n\n})\n`
    expect(edit('a.ts', blankLines, [{ path: ['muted'], value: true }]).text)
      .toBe(`import { ApiCheck } from 'checkly'\nnew ApiCheck('api', {\n  muted: true\n})\n`)
  })

  it('follows double quotes, tabs and CRLF line endings', () => {
    const source = `import { ApiCheck } from "checkly"\r\nnew ApiCheck("api", {\r\n\tname: "x",\r\n\trequest: {\r\n\t\turl: "u",\r\n\t},\r\n})\r\n`
    const { text } = edit('a.ts', source, [
      { path: ['name'], value: 'it\'s "quoted"' },
      { path: ['tags'], value: [{ deep: 1 }] },
    ])
    expect(text).toBe(`import { ApiCheck } from "checkly"\r\nnew ApiCheck("api", {\r\n\tname: "it's \\"quoted\\"",\r\n\trequest: {\r\n\t\turl: "u",\r\n\t},\r\n\ttags: [\r\n\t\t{\r\n\t\t\tdeep: 1,\r\n\t\t},\r\n\t],\r\n})\r\n`)
  })

  it('encodes control characters and line separators so the file still parses', () => {
    const value = 'a b c\nd\re\tf\\g\'h"i\0j'
    const { text, applied } = edit('a.ts', TS, [{ path: ['name'], value }])
    expect(applied[0].rendered).toBe('\'a\\u2028b\\u2029c\\nd\\re\\tf\\\\g\\\'h"i\\u0000j\'')
    const reread = resolvePath(options('a.ts', text), ['name'])
    expect(reread.kind).toBe('found')
    expect(evaluateLiteral((reread as any).node)).toBe(value)
    // A backslash before a quote, and a lone surrogate, in both quote styles.
    for (const tricky of ['\\\'', '\\"', 'x\\', '\ud800', '\'\\\'\'']) {
      for (const file of [TS, TS.replace(/'/g, '"')]) {
        const result = edit('a.ts', file, [{ path: ['name'], value: tricky }])
        expect(result.skipped).toEqual([])
        expect(readsBack('a.ts', result.text, ['name'], tricky)).toBe(true)
      }
    }
  })

  it('quotes keys that are not identifiers', () => {
    const { text } = edit('a.ts', TS, [{ path: ['request', 'basicAuth'], value: { 'user-name': 'u', 'password': 'p' } }])
    expect(text).toContain(`    basicAuth: {
      'user-name': 'u',
      password: 'p',
    },
  },`)
  })

  it('skips what it cannot write and says why', () => {
    const { text, applied, skipped } = edit('a.ts', TS, [
      { path: ['frequency'], value: 10 },
      { path: ['locations'], value: ['us-east-1'] },
      { path: ['heartbeat', 'period'], value: 1 },
      { path: ['description'], value: null },
      { path: ['tags'], value: ['x', null] },
      { path: ['degradedResponseTime'], value: Number.POSITIVE_INFINITY },
      { path: ['name'], value: () => 1 },
      { path: ['request', 'url'], value: 'https://y' },
      { path: ['request'], value: { url: 'https://x' } },
    ])
    expect(applied.map(a => a.path.join('.'))).toEqual(['request.url'])
    expect(skipped.map(s => [s.path.join('.'), s.reason])).toEqual([
      ['frequency', 'frequency is Frequency.EVERY_5M, not a plain literal'],
      ['locations', 'locations is the variable shared, not a plain literal'],
      ['heartbeat.period', 'heartbeat is not set in the code'],
      ['description', 'Checkly has no value for description; edit the property by hand'],
      ['tags', 'Checkly has no value for tags.1; edit the property by hand'],
      ['degradedResponseTime', 'Infinity cannot be written as a literal'],
      ['name', 'a function cannot be written as a literal'],
      ['request', 'overlaps another edit'],
    ])
    expect(text).toBe(TS.replace('https://example.com\'', 'https://y\''))
  })

  it('is not fooled by commas or line breaks inside comments', () => {
    const lineComment = `import { ApiCheck } from 'checkly'
new ApiCheck('api', {
  name: 'x' // a, b
})
`
    let result = edit('a.ts', lineComment, [{ path: ['muted'], value: true }])
    expect(result.text).toBe(`import { ApiCheck } from 'checkly'
new ApiCheck('api', {
  name: 'x', // a, b
  muted: true
})
`)
    expect(readsBack('a.ts', result.text, ['muted'], true)).toBe(true)

    const blockComment = `import { ApiCheck } from 'checkly'
new ApiCheck('api', {
  name: 'x', /* one,
  two */
})
`
    result = edit('a.ts', blockComment, [{ path: ['muted'], value: true }])
    expect(result.text).toBe(`import { ApiCheck } from 'checkly'
new ApiCheck('api', {
  name: 'x',
  muted: true, /* one,
  two */
})
`)
    expect(readsBack('a.ts', result.text, ['muted'], true)).toBe(true)

    const oneLine = `const { ApiCheck } = require('checkly')\nnew ApiCheck('api', { name: 'x' /* , */ })\n`
    result = edit('a.js', oneLine, [{ path: ['muted'], value: true }])
    expect(result.text).toBe(`const { ApiCheck } = require('checkly')\nnew ApiCheck('api', { name: 'x', muted: true /* , */ })\n`)
    expect(readsBack('a.js', result.text, ['muted'], true)).toBe(true)

    const ownLine = `import { ApiCheck } from 'checkly'
new ApiCheck('api', {
  name: 'x'
  ,
})
`
    result = edit('a.ts', ownLine, [{ path: ['muted'], value: true }])
    expect(readsBack('a.ts', result.text, ['muted'], true)).toBe(true)
    expect(readsBack('a.ts', result.text, ['name'], 'x')).toBe(true)
  })

  it('refuses to add a key next to members it cannot read', () => {
    const source = `import { ApiCheck } from 'checkly'\nnew ApiCheck('api', { get name () { return 'x' }, ['muted']: true, tags: ['a'] })\n`
    const { applied, skipped } = edit('a.ts', source, [
      { path: ['name'], value: 'y' },
      { path: ['muted'], value: false },
      { path: ['tags'], value: ['b'] },
    ])
    expect(skipped.map(s => s.reason)).toEqual([
      'the options has members this tool cannot read',
      'the options has members this tool cannot read',
    ])
    expect(applied.map(a => a.path.join('.'))).toEqual(['tags'])
  })

  it('refuses values that are not JSON data and quotes __proto__', () => {
    // A `__proto__` key in a literal would set the prototype; `fromEntries` makes it an own property.
    const proto = Object.fromEntries([['__proto__', 'x'], ['username', 'u']])
    const { text, skipped } = edit('a.ts', TS, [
      { path: ['name'], value: new Date(0) },
      { path: ['tags'], value: new Map() },
      { path: ['request', 'basicAuth'], value: proto },
    ])
    expect(skipped.map(s => [s.path.join('.'), s.reason])).toEqual([
      ['name', 'a Date cannot be written as a literal'],
      ['tags', 'a Map cannot be written as a literal'],
    ])
    expect(text).toContain(`    basicAuth: {
      '__proto__': 'x',
      username: 'u',
    },`)
    expect(readsBack('a.ts', text, ['request', 'basicAuth'], proto)).toBe(true)
  })

  it('reads .jsx and .tsx through the TypeScript parser', () => {
    const jsx = `import { ApiCheck } from 'checkly'\nconst el = <div />\nnew ApiCheck('api', { name: 'x' })\n`
    for (const file of ['a.jsx', 'a.tsx']) {
      expect(edit(file, jsx, [{ path: ['muted'], value: true }]).text).toContain(`{ name: 'x', muted: true }`)
    }
  })

  it('refuses an empty path and keeps a member on the last line at its own column', () => {
    expect(edit('a.ts', TS, [{ path: [], value: {} }]).skipped).toEqual([{ path: [], value: {}, reason: 'no property named' }])
    const cramped = `import { ApiCheck } from 'checkly'
new ApiCheck('api', { name: 'x', tags: [
  'a',
] })
`
    const { text } = edit('a.ts', cramped, [{ path: ['muted'], value: true }])
    expect(text).toBe(`import { ApiCheck } from 'checkly'
new ApiCheck('api', { name: 'x', tags: [
  'a',
],
  muted: true })
`)
    expect(readsBack('a.ts', text, ['muted'], true)).toBe(true)
  })

  it('applies only the first of two edits to the same bytes', () => {
    const source = `import { ApiCheck } from 'checkly'\nnew ApiCheck('api', { request: { headers: [{ key: 'a', value: '1' }] } })\n`
    const { text, skipped } = edit('a.ts', source, [
      { path: ['request', 'headers'], value: [{ key: 'b', value: '2' }] },
      { path: ['request', 'headers', '0', 'value'], value: '3' },
      { path: ['muted'], value: true },
      { path: ['muted'], value: false },
    ])
    expect(skipped.map(s => [s.path.join('.'), s.reason])).toEqual([
      ['request.headers.0.value', 'overlaps another edit'],
      ['muted', 'overlaps another edit'],
    ])
    expect(text).toBe(`import { ApiCheck } from 'checkly'\nnew ApiCheck('api', { request: { headers: [{ key: 'b', value: '2' }] }, muted: true })\n`)
    // An insertion into an object that another edit replaces whole.
    const nested = edit('a.ts', source, [
      { path: ['request'], value: { url: 'u' } },
      { path: ['request', 'body'], value: 'b' },
    ])
    expect(nested.skipped).toEqual([{ path: ['request', 'body'], value: 'b', reason: 'overlaps another edit' }])
    expect(readsBack('a.ts', nested.text, ['request'], { url: 'u' })).toBe(true)
  })
})
