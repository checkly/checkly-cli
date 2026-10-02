import { describe, expect, it } from 'vitest'

import { applyEdits, readsBack } from '../apply-edits.js'
import {
  type AssertionBuilderName,
  buildHelperValue,
  type HelperEdit,
  isHelperExpression,
  isReplaceableByHelper,
  matchesValue,
  renderExpression,
} from '../helper-edit.js'
import { appendImports, resolveImports } from '../imports.js'
import { resolvePath } from '../literal-edit.js'
import { checklyBindings, findConstructOptions, parseSource, usesIdentifier } from '../source-file.js'
import { Output } from '../../../sourcegen/index.js'

/**
 * Helper edits (`helper-edit.ts`, `apply-edits.ts`, the import handling in
 * `source-file.ts`): rendering the codegen's expressions in the file's
 * style, deciding which existing nodes may be replaced by one, adding the
 * helper's import, and reading the result back.
 */

const NAMES = new Set(['ApiCheck'])

function apply (file: string, text: string, edits: HelperEdit[], logicalId = 'api') {
  const source = parseSource(file, text)
  return applyEdits(source, findConstructOptions(source, logicalId, NAMES), edits)
}

/** The node at `path` of the options of `new ApiCheck('api', …)` in `text`. */
function nodeAt (file: string, text: string, path: string[]) {
  const source = parseSource(file, text)
  const resolution = resolvePath(findConstructOptions(source, 'api', NAMES), path, { replaceable: () => true, replaceNull: true })
  if (resolution.kind !== 'found') {
    throw new Error(`no node at ${path.join('.')}`)
  }
  return { source, node: resolution.node }
}

const frequency = (value: unknown, extra: { literalAlternative?: unknown } = {}): HelperEdit =>
  ({ path: ['frequency'], value, helper: 'frequency', ...extra })
const retry = (value: unknown): HelperEdit =>
  ({ path: ['retryStrategy'], value, helper: 'retryStrategy', unless: ['doubleCheck'] })
const escalation = (value: unknown): HelperEdit =>
  ({ path: ['alertEscalationPolicy'], value, helper: 'alertEscalation' })
const assertions = (value: unknown, builder: AssertionBuilderName = 'AssertionBuilder'): HelperEdit =>
  ({ path: ['request', 'assertions'], value, helper: 'assertions', builder })
const date = (value: unknown): HelperEdit => ({ path: ['startsAt'], value, helper: 'date' })

const STYLE = { quote: '\'' as const, indentUnit: '  ', lineEnding: '\n' as const }
const LAYOUT = { column: '  ', inline: false, trailingComma: true, locals: new Map<string, string>() }

const TS = `import { ApiCheck } from 'checkly/constructs'

new ApiCheck('api', {
  name: 'API',
  frequency: 10,
  request: {
    url: 'https://example.com',
    method: 'GET',
  },
})
`

describe('buildHelperValue and renderExpression', () => {
  it('renders every kind of helper the way checkly import spells it, in the file style', () => {
    const render = (edit: HelperEdit, layout = LAYOUT, style = STYLE) => {
      const { value } = buildHelperValue(edit)
      return renderExpression(value, style, layout)
    }
    expect(render(frequency({ frequency: 0, frequencyOffset: 30 }))).toBe('Frequency.EVERY_30S')
    expect(render(frequency({ frequency: 10, frequencyOffset: 17 }))).toBe('Frequency.EVERY_10M')
    expect(render(frequency({ frequency: 7 }))).toBe('7')
    expect(render(frequency(7))).toBe('7')
    expect(render(frequency({ frequency: 0, frequencyOffset: 15 }))).toBe('new Frequency(0, 15)')
    expect(render(retry(null))).toBe('RetryStrategyBuilder.noRetries()')
    expect(render(date('2026-01-01T00:00:00.000Z'))).toBe('new Date(\'2026-01-01T00:00:00.000Z\')')
    expect(buildHelperValue(date('2026-01-01T00:00:00.000Z')).imports).toEqual([])
    expect(render(retry({ type: 'FIXED', baseBackoffSeconds: 60, maxRetries: 2, maxDurationSeconds: 600, sameRegion: true })))
      .toBe('RetryStrategyBuilder.fixedStrategy({})')
    expect(render(retry({ type: 'LINEAR', baseBackoffSeconds: 10, maxRetries: 3, sameRegion: false, onlyOn: 'NETWORK_ERROR' })))
      .toBe(`RetryStrategyBuilder.linearStrategy({
    baseBackoffSeconds: 10,
    maxRetries: 3,
    sameRegion: false,
    onlyOn: 'NETWORK_ERROR',
  })`)
    expect(render(retry({ type: 'SINGLE_RETRY', baseBackoffSeconds: 5 }), { ...LAYOUT, inline: true }))
      .toBe('RetryStrategyBuilder.singleRetry({ baseBackoffSeconds: 5 })')
    expect(render(escalation({
      escalationType: 'RUN_BASED',
      runBasedEscalation: { failedRunThreshold: 3 },
      reminders: { amount: 2, interval: 10 },
      parallelRunFailureThreshold: { enabled: true, percentage: 20 },
    }), { ...LAYOUT, trailingComma: false }, { ...STYLE, quote: '"', indentUnit: '\t' })).toBe(`AlertEscalationBuilder.runBasedEscalation(3, {
  \tamount: 2,
  \tinterval: 10
  }, {
  \tenabled: true,
  \tpercentage: 20
  })`)
    expect(render(escalation({
      escalationType: 'TIME_BASED',
      timeBasedEscalation: { minutesFailingThreshold: 10 },
      parallelRunFailureThreshold: { enabled: false, percentage: 10 },
    }), { ...LAYOUT, inline: true })).toBe('AlertEscalationBuilder.timeBasedEscalation(10, undefined, { enabled: false, percentage: 10 })')
    expect(render(assertions([
      { source: 'STATUS_CODE', property: '', comparison: 'EQUALS', target: '200', regex: null },
      { source: 'JSON_BODY', property: '$.it\'s', comparison: 'HAS_KEY', target: 'id', regex: null },
    ]), LAYOUT, { ...STYLE, quote: '"', lineEnding: '\r\n' })).toBe(`[\r
    AssertionBuilder.statusCode().equals(200),\r
    AssertionBuilder.jsonBody("$.it's").hasKey("id"),\r
  ]`)
    expect(render(assertions([]))).toBe('[]')
    expect(render(assertions([{ source: 'STATUS_CODE', property: '', comparison: 'LESS_THAN', target: '500', regex: null }], 'UrlAssertionBuilder'),
      { ...LAYOUT, inline: true })).toBe('[UrlAssertionBuilder.statusCode().lessThan(500)]')
  })

  it('names the classes the expression references, under the local name when the file aliases it', () => {
    const { value, imports } = buildHelperValue(frequency({ frequency: 5 }))
    expect(imports).toEqual(['Frequency'])
    expect(renderExpression(value, STYLE, { ...LAYOUT, locals: new Map([['Frequency', 'F']]) })).toBe('F.EVERY_5M')
    expect(buildHelperValue(frequency({ frequency: 7 })).imports).toEqual([])
  })

  it('refuses what the codegen cannot spell, with the innermost reason, and what means unset', () => {
    expect(() => buildHelperValue(assertions([{ source: 'MOOD', comparison: 'EQUALS', target: 'x', property: '', regex: null }])))
      .toThrow('Checkly reported a value this CLI cannot spell: Unsupported assertion source MOOD')
    expect(() => buildHelperValue(retry({ type: 'RANDOM' })))
      .toThrow('Checkly reported a value this CLI cannot spell: Unsupported retry strategy type RANDOM')
    // The builders wrap each failure in another; the innermost message is the useful one.
    expect(() => buildHelperValue(escalation({ escalationType: 'RUN_BASED', reminders: { amount: null } })))
      .toThrow('Checkly reported a value this CLI cannot spell: Number value cannot be null')
    expect(() => buildHelperValue(assertions(null))).toThrow('Checkly has no value for request.assertions; edit the property by hand')
    expect(() => buildHelperValue(frequency({ frequency: null }))).toThrow('Checkly has no value for frequency; edit the property by hand')
    expect(() => buildHelperValue(assertions([], 'NoSuchBuilder' as AssertionBuilderName)))
      .toThrow('NoSuchBuilder is not an assertion builder this tool knows')
    expect(() => buildHelperValue(assertions([null]))).toThrow('Checkly has no value for request.assertions; edit the property by hand')
    expect(() => buildHelperValue(escalation({}))).toThrow('Checkly has no value for alertEscalationPolicy; edit the property by hand')
    expect(() => buildHelperValue(retry({}))).toThrow('Checkly has no value for retryStrategy; edit the property by hand')
    expect(() => buildHelperValue(date(null))).toThrow('Checkly has no value for startsAt; edit the property by hand')
    expect(() => buildHelperValue(date('yesterday'))).toThrow('Checkly has no value for startsAt; edit the property by hand')
    // A number the codegen cannot compute is refused before it reaches the file.
    const nan = assertions([{ source: 'STATUS_CODE', comparison: 'EQUALS', target: 'abc', property: '', regex: null }])
    expect(() => renderExpression(buildHelperValue(nan).value, STYLE, LAYOUT)).toThrow('NaN cannot be written as a literal')
  })

  it('builds the assertions of every monitor class with that class\'s own builder', () => {
    const cases: [AssertionBuilderName, Record<string, unknown>, string][] = [
      ['AssertionBuilder', { source: 'STATUS_CODE', comparison: 'EQUALS', target: '200' }, 'AssertionBuilder.statusCode().equals(200)'],
      ['UrlAssertionBuilder', { source: 'STATUS_CODE', comparison: 'LESS_THAN', target: '500' }, 'UrlAssertionBuilder.statusCode().lessThan(500)'],
      ['TcpAssertionBuilder', { source: 'RESPONSE_DATA', comparison: 'CONTAINS', target: 'ok' }, 'TcpAssertionBuilder.responseData().contains(\'ok\')'],
      ['DnsAssertionBuilder', { source: 'RESPONSE_TIME', comparison: 'LESS_THAN', target: '100' }, 'DnsAssertionBuilder.responseTime().lessThan(100)'],
      ['GrpcAssertionBuilder', { source: 'GRPC_STATUS_CODE', comparison: 'EQUALS', target: '0' }, 'GrpcAssertionBuilder.statusCode().equals(0)'],
      ['SslAssertionBuilder', { source: 'TEXT_RESPONSE', comparison: 'CONTAINS', target: 'x' }, 'SslAssertionBuilder.textResponse().contains(\'x\')'],
      ['IcmpAssertionBuilder', { source: 'LATENCY', comparison: 'LESS_THAN', target: '50', property: 'avg' }, 'IcmpAssertionBuilder.latency(\'avg\').lessThan(50)'],
      ['TracerouteAssertionBuilder', { source: 'HOP_COUNT', comparison: 'LESS_THAN', target: '10' }, 'TracerouteAssertionBuilder.hopCount().lessThan(10)'],
    ]
    for (const [builder, assertion, expected] of cases) {
      const { value, imports } = buildHelperValue(assertions([{ property: '', regex: null, ...assertion }], builder))
      expect(imports, builder).toEqual([builder])
      expect(renderExpression(value, STYLE, { ...LAYOUT, inline: true }), builder).toBe(`[${expected}]`)
    }
  })
})

describe('isHelperExpression and matchesValue', () => {
  const locals = new Set(['Frequency', 'RetryStrategyBuilder', 'AssertionBuilder'])
  const expression = (code: string) => {
    const text = `import { ApiCheck } from 'checkly/constructs'\nconst retries = 3\nnew ApiCheck('api', { x: ${code} })\n`
    return nodeAt('a.ts', text, ['x']).node
  }

  it('accepts chains on the helper with literal arguments and refuses the rest', () => {
    expect(isHelperExpression(expression('Frequency.EVERY_5M'), locals)).toBe(true)
    expect(isHelperExpression(expression('new Frequency(0, 30)'), locals)).toBe(true)
    expect(isHelperExpression(expression('RetryStrategyBuilder.fixedStrategy({ maxRetries: 3, onlyOn: [\'NETWORK_ERROR\'] })'), locals)).toBe(true)
    expect(isHelperExpression(expression('AssertionBuilder.jsonBody(\'$.a\').equals(1)'), locals)).toBe(true)
    expect(isHelperExpression(expression('AssertionBuilder.timeBased(1, undefined, { enabled: true })'), locals)).toBe(true)
    expect(isHelperExpression(expression('RetryStrategyBuilder.fixedStrategy({ maxRetries: retries })'), locals)).toBe(false)
    expect(isHelperExpression(expression('Other.EVERY_5M'), locals)).toBe(false)
    expect(isHelperExpression(expression('Frequency[\'EVERY_5M\']'), locals)).toBe(false)
    expect(isHelperExpression(expression('RetryStrategyBuilder.fixedStrategy(...args)'), locals)).toBe(false)
    expect(isHelperExpression(expression('Frequency.EVERY_5M as const'), locals)).toBe(false)
    expect(isHelperExpression(expression('5'), locals)).toBe(false)
    expect(isReplaceableByHelper(expression('5'), locals)).toBe(true)
    expect(isReplaceableByHelper(expression('null'), locals)).toBe(true)
    expect(isReplaceableByHelper(expression('[AssertionBuilder.statusCode().equals(200), { source: \'STATUS_CODE\' }]'), locals)).toBe(true)
    expect(isReplaceableByHelper(expression('[AssertionBuilder.statusCode().equals(200), custom]'), locals)).toBe(false)
    expect(isReplaceableByHelper(expression('[...custom]'), locals)).toBe(false)
    // The codegen spells an assertion it has no builder method for as an object with `regex: null`.
    expect(isReplaceableByHelper(expression('[{ source: \'X\', regex: null }]'), locals)).toBe(true)
    expect(isReplaceableByHelper(expression('[{ source: \'X\', regex: undefined }]'), locals)).toBe(false)
  })

  it('matches a parsed node against the expression it was rendered from', () => {
    const cases: [HelperEdit, string, boolean][] = [
      [frequency({ frequency: 0, frequencyOffset: 30 }), 'Frequency.EVERY_30S', true],
      [frequency({ frequency: 0, frequencyOffset: 30 }), 'Frequency.EVERY_20S', false],
      [frequency({ frequency: 0, frequencyOffset: 15 }), 'new Frequency(0, 15)', true],
      [frequency({ frequency: 7 }), '7', true],
      [retry(null), 'RetryStrategyBuilder.noRetries()', true],
      [retry(null), 'RetryStrategyBuilder.noRetries(1)', false],
      [retry({ type: 'FIXED', maxRetries: 3, sameRegion: false }), 'RetryStrategyBuilder.fixedStrategy({ sameRegion: false, maxRetries: 3 })', true],
      [retry({ type: 'FIXED', maxRetries: 3 }), 'RetryStrategyBuilder.fixedStrategy({ maxRetries: 4 })', false],
      [retry({ type: 'FIXED', maxRetries: 3 }), 'RetryStrategyBuilder.fixedStrategy({ maxRetries: 3, extra: 1 })', false],
      [escalation({ escalationType: 'TIME_BASED', timeBasedEscalation: { minutesFailingThreshold: 10 }, parallelRunFailureThreshold: { enabled: false, percentage: 10 } }),
        'AlertEscalationBuilder.timeBasedEscalation(10, undefined, { enabled: false, percentage: 10 })', true],
      [assertions([{ source: 'STATUS_CODE', property: '', comparison: 'EQUALS', target: '200', regex: null }]),
        '[AssertionBuilder.statusCode().equals(200)]', true],
      [assertions([{ source: 'STATUS_CODE', property: '', comparison: 'EQUALS', target: '200', regex: null }]),
        '[AssertionBuilder.statusCode().equals(-200)]', false],
      [assertions([]), '[]', true],
      [date('2026-01-01T00:00:00.000Z'), 'new Date(\'2026-01-01T00:00:00.000Z\')', true],
      [date('2026-01-01T00:00:00.000Z'), 'new Date(\'2026-01-01T00:00:00Z\')', false],
    ]
    const boundAs = new Map<string, string>()
    for (const [edit, code, expected] of cases) {
      const { value } = buildHelperValue(edit)
      expect(matchesValue(expression(code), value, boundAs), code).toBe(expected)
    }
    const { value } = buildHelperValue(frequency({ frequency: 5 }))
    expect(matchesValue(expression('F.EVERY_5M'), value, new Map([['Frequency', 'F']]))).toBe(true)
    expect(matchesValue(expression('Frequency.EVERY_5M'), value, new Map([['Frequency', 'F']]))).toBe(false)
  })
})

describe('resolveImports and appendImports', () => {
  const plan = (file: string, text: string, names: string[]) => {
    const source = parseSource(file, text)
    const { refused, missing } = resolveImports(source, names)
    const splice = appendImports(source, missing)
    const applied = splice === undefined ? text : text.slice(0, splice.start) + splice.text + text.slice(splice.end)
    return { refused, missing, splice, applied }
  }

  it('reuses an existing binding, aliased or required, and adds nothing', () => {
    const aliased = plan('a.ts', `import { ApiCheck, Frequency as F } from 'checkly/constructs'\n`, ['Frequency'])
    expect(aliased.missing).toEqual([])
    expect(aliased.splice).toBeUndefined()
    const required = plan('a.cjs', `const { ApiCheck, RetryStrategyBuilder: Retry } = require('checkly/constructs')\n`, ['RetryStrategyBuilder'])
    expect(required.missing).toEqual([])
    expect(required.splice).toBeUndefined()
  })

  it('appends to a one-line import, a multi-line one with or without a trailing comma, and a require', () => {
    expect(plan('a.ts', `import { ApiCheck } from 'checkly/constructs'\nnew ApiCheck('api', {})\n`, ['Frequency', 'AssertionBuilder']).applied)
      .toBe(`import { ApiCheck, Frequency, AssertionBuilder } from 'checkly/constructs'\nnew ApiCheck('api', {})\n`)
    expect(plan('a.ts', `import {\n  ApiCheck,\n  CheckGroup,\n} from 'checkly/constructs'\n`, ['Frequency', 'AssertionBuilder']).applied)
      .toBe(`import {\n  ApiCheck,\n  CheckGroup,\n  Frequency,\n  AssertionBuilder,\n} from 'checkly/constructs'\n`)
    expect(plan('a.ts', `import {\r\n\tApiCheck,\r\n\tCheckGroup\r\n} from "checkly/constructs";\r\n`, ['Frequency']).applied)
      .toBe(`import {\r\n\tApiCheck,\r\n\tCheckGroup,\r\n\tFrequency\r\n} from "checkly/constructs";\r\n`)
    expect(plan('a.js', `const { ApiCheck } = require('checkly/constructs')\n`, ['Frequency']).applied)
      .toBe(`const { ApiCheck, Frequency } = require('checkly/constructs')\n`)
    expect(plan('a.js', `const {\n  ApiCheck,\n} = require('checkly/constructs')\n`, ['Frequency']).applied)
      .toBe(`const {\n  ApiCheck,\n  Frequency,\n} = require('checkly/constructs')\n`)
    // The first value import of the module is extended, not a type-only one.
    expect(plan('a.ts', `import type { CheckProps } from 'checkly/constructs'\nimport { ApiCheck } from 'checkly/constructs'\n`, ['Frequency']).applied)
      .toBe(`import type { CheckProps } from 'checkly/constructs'\nimport { ApiCheck, Frequency } from 'checkly/constructs'\n`)
  })

  it('keeps a comment behind the last specifier with it, and reads the layout from the braces', () => {
    expect(plan('a.ts', `import {\n  ApiCheck, // main\n} from 'checkly/constructs'\n`, ['Frequency']).applied)
      .toBe(`import {\n  ApiCheck, // main\n  Frequency,\n} from 'checkly/constructs'\n`)
    expect(plan('a.ts', `import {\n  ApiCheck // main\n} from 'checkly/constructs'\n`, ['Frequency']).applied)
      .toBe(`import {\n  ApiCheck, // main\n  Frequency\n} from 'checkly/constructs'\n`)
    expect(plan('a.ts', `import {\n  ApiCheck /* a\n  b */\n} from 'checkly/constructs'\n`, ['Frequency']).applied)
      .toBe(`import {\n  ApiCheck,\n  Frequency /* a\n  b */\n} from 'checkly/constructs'\n`)
    expect(plan('a.ts', `import { ApiCheck }\n  from 'checkly/constructs'\n`, ['Frequency']).applied)
      .toBe(`import { ApiCheck, Frequency }\n  from 'checkly/constructs'\n`)
  })

  it('refuses a name the file already uses, and a file with no checkly/constructs declaration to extend', () => {
    const clash = plan('a.ts', `import { ApiCheck } from 'checkly/constructs'\nimport { Frequency } from './mine.js'\n`, ['Frequency', 'AssertionBuilder'])
    expect(clash.refused.get('Frequency')).toBe('Frequency is already used for something else in this file')
    expect(clash.missing).toEqual(['AssertionBuilder'])
    expect(clash.applied).toContain(`import { ApiCheck, AssertionBuilder } from 'checkly/constructs'`)
    const typed = plan('a.ts', `import { ApiCheck } from 'checkly/constructs'\ntype Frequency = number\n`, ['Frequency'])
    expect(typed.refused.get('Frequency')).toBe('Frequency is already used for something else in this file')
    const typeOnly = plan('a.ts', `import { ApiCheck } from 'checkly/constructs'\nimport type { Frequency } from 'checkly/constructs'\n`, ['Frequency'])
    expect(typeOnly.refused.get('Frequency')).toBe('Frequency is already used for something else in this file')
    const deep = plan('a.ts', `import { ApiCheck } from 'checkly/constructs/api-check.js'\n`, ['Frequency'])
    expect(deep.refused.get('Frequency')).toBe('add `import { Frequency } from \'checkly/constructs\'` by hand')
    expect(deep.splice).toBeUndefined()
  })

  it('does not take a member or property name for a use of the identifier', () => {
    const program = parseSource('a.ts', `const x = { Frequency: 1 }\nx.Frequency\nclass C { Frequency = 2 }\n`).program
    expect(usesIdentifier(program, 'Frequency')).toBe(false)
    expect(usesIdentifier(parseSource('a.ts', `x[Frequency]\n`).program, 'Frequency')).toBe(true)
    expect(usesIdentifier(parseSource('a.ts', `let v: Frequency\n`).program, 'Frequency')).toBe(true)
    expect(usesIdentifier(parseSource('a.js', `const { Frequency } = x\n`).program, 'Frequency')).toBe(true)
  })

  it('binds nothing through a type-only import', () => {
    const program = parseSource('a.ts', `import type { ApiCheck } from 'checkly/constructs'\nimport { type Frequency, CheckGroup } from 'checkly/constructs'\n`).program
    expect(checklyBindings(program, new Set(['ApiCheck', 'Frequency', 'CheckGroup']))).toEqual(new Set(['CheckGroup']))
  })
})

describe('applyEdits with helper edits', () => {
  it('replaces a literal with the helper form, adds the import, and reads back', () => {
    const result = apply('a.ts', TS, [frequency({ frequency: 0, frequencyOffset: 30 })])
    expect(result.skipped).toEqual([])
    expect(result.imports).toEqual(['Frequency'])
    expect(result.applied).toMatchObject([
      { path: ['frequency'], value: { frequency: 0, frequencyOffset: 30 }, previous: '10', rendered: 'Frequency.EVERY_30S', form: 'helper' },
    ])
    expect(result.applied[0].expression?.locals).toEqual(new Map([['Frequency', 'Frequency']]))
    expect(result.text).toBe(TS.replace(`import { ApiCheck }`, `import { ApiCheck, Frequency }`).replace('frequency: 10', 'frequency: Frequency.EVERY_30S'))
    const { source, node } = nodeAt('a.ts', result.text, ['frequency'])
    const { value } = buildHelperValue(frequency({ frequency: 0, frequencyOffset: 30 }))
    expect(matchesValue(node, value, new Map())).toBe(true)
    expect(checklyBindings(source.program, new Set(['Frequency']))).toEqual(new Set(['Frequency']))
  })

  it('keeps a number a number when the edit offers a literal alternative, without an import', () => {
    const result = apply('a.ts', TS, [frequency({ frequency: 5, frequencyOffset: 12 }, { literalAlternative: 5 })])
    expect(result.applied).toEqual([
      { path: ['frequency'], value: { frequency: 5, frequencyOffset: 12 }, previous: '10', rendered: '5', form: 'literal', expected: 5 },
    ])
    expect(result.imports).toEqual([])
    expect(result.text).not.toContain('Frequency')
    // The alternative is not used where the code spells the helper.
    const helper = TS.replace('frequency: 10', 'frequency: Frequency.EVERY_10M').replace('{ ApiCheck }', '{ ApiCheck, Frequency }')
    const replaced = apply('a.ts', helper, [frequency({ frequency: 5 }, { literalAlternative: 5 })])
    expect(replaced.applied[0]).toMatchObject({ previous: 'Frequency.EVERY_10M', rendered: 'Frequency.EVERY_5M', form: 'helper' })
    expect(replaced.imports).toEqual([])
  })

  it('inserts a missing property in the helper form and renders nested objects at the member column', () => {
    const result = apply('a.ts', TS, [
      retry({ type: 'FIXED', maxRetries: 3, sameRegion: false }),
      assertions([{ source: 'STATUS_CODE', property: '', comparison: 'EQUALS', target: '200', regex: null }]),
    ])
    expect(result.skipped).toEqual([])
    expect(result.imports).toEqual(['RetryStrategyBuilder', 'AssertionBuilder'])
    expect(result.text).toBe(`import { ApiCheck, RetryStrategyBuilder, AssertionBuilder } from 'checkly/constructs'

new ApiCheck('api', {
  name: 'API',
  frequency: 10,
  request: {
    url: 'https://example.com',
    method: 'GET',
    assertions: [
      AssertionBuilder.statusCode().equals(200),
    ],
  },
  retryStrategy: RetryStrategyBuilder.fixedStrategy({
    maxRetries: 3,
    sameRegion: false,
  }),
})
`)
  })

  it('replaces an existing helper expression, following its one-line layout, and the aliased name', () => {
    const text = `import { ApiCheck, RetryStrategyBuilder as Retry } from 'checkly/constructs'
new ApiCheck('api', { retryStrategy: Retry.linearStrategy({ maxRetries: 2 }) })
`
    const result = apply('a.ts', text, [retry({ type: 'EXPONENTIAL', baseBackoffSeconds: 5 })])
    expect(result.applied[0]).toMatchObject({ previous: 'Retry.linearStrategy({ maxRetries: 2 })', rendered: 'Retry.exponentialStrategy({ baseBackoffSeconds: 5 })' })
    expect(result.applied[0].expression?.locals).toEqual(new Map([['RetryStrategyBuilder', 'Retry']]))
    expect(result.imports).toEqual([])
    expect(result.text).toContain(`{ retryStrategy: Retry.exponentialStrategy({ baseBackoffSeconds: 5 }) }`)
  })

  it('keeps the trailing-comma habit of the lists inside a replaced expression, or of the options', () => {
    const withComma = `import { ApiCheck, RetryStrategyBuilder } from 'checkly/constructs'
new ApiCheck('api', {
  retryStrategy: RetryStrategyBuilder.fixedStrategy({
    maxRetries: 2,
  }),
})
`
    expect(apply('a.ts', withComma, [retry({ type: 'FIXED', maxRetries: 3, sameRegion: false })]).text)
      .toContain(`fixedStrategy({\n    maxRetries: 3,\n    sameRegion: false,\n  })`)
    const without = withComma.replace('maxRetries: 2,\n', 'maxRetries: 2\n')
    expect(apply('a.ts', without, [retry({ type: 'FIXED', maxRetries: 3, sameRegion: false })]).text)
      .toContain(`fixedStrategy({\n    maxRetries: 3,\n    sameRegion: false\n  })`)
    // A null, or a bare constant, holds no list: the object holding it decides.
    const bare = `import { ApiCheck, RetryStrategyBuilder } from 'checkly/constructs'
new ApiCheck('api', {
  retryStrategy: null
})
`
    expect(apply('a.ts', bare, [retry({ type: 'FIXED', maxRetries: 3, sameRegion: false })]).text)
      .toContain(`retryStrategy: RetryStrategyBuilder.fixedStrategy({\n    maxRetries: 3,\n    sameRegion: false\n  })\n`)
    const oneLine = `import { ApiCheck, RetryStrategyBuilder } from 'checkly/constructs'\nnew ApiCheck('api', { retryStrategy: null })\n`
    expect(apply('a.ts', oneLine, [retry({ type: 'FIXED', maxRetries: 3 })]).text)
      .toContain(`{ retryStrategy: RetryStrategyBuilder.fixedStrategy({ maxRetries: 3 }) }`)
  })

  it('skips what it must not touch, with the reason', () => {
    const text = `import { ApiCheck, Frequency } from 'checkly/constructs'
import { RetryStrategyBuilder } from './mine.js'
const retries = 3
new ApiCheck('api', {
  frequency: Frequency.EVERY_5M as const,
  retryStrategy: { type: 'FIXED', maxRetries: 3 },
  doubleCheck: true,
  request: { assertions: custom },
})
`
    const result = apply('a.ts', text, [
      frequency({ frequency: 10 }),
      retry({ type: 'FIXED', maxRetries: 2 }),
      assertions([]),
      escalation({ escalationType: 'RUN_BASED', runBasedEscalation: { failedRunThreshold: 2 } }),
    ])
    expect(result.applied.map(edit => edit.path.join('.'))).toEqual(['alertEscalationPolicy'])
    expect(result.skipped.map(edit => [edit.path.join('.'), edit.reason])).toEqual([
      ['frequency', 'frequency is a TypeScript expression, not a literal or a Frequency expression'],
      ['retryStrategy', 'doubleCheck is set in the code; replace it with retryStrategy by hand'],
      ['request.assertions', 'request.assertions is the variable custom, not a literal or a AssertionBuilder expression'],
    ])
    expect(result.imports).toEqual(['AlertEscalationBuilder'])
    // A helper whose class the file binds to something else is refused, and its import is not added.
    const clash = apply('a.ts', text.replace('doubleCheck: true,\n', ''), [retry({ type: 'FIXED', maxRetries: 2 })])
    expect(clash.applied).toEqual([])
    expect(clash.skipped).toEqual([{ ...retry({ type: 'FIXED', maxRetries: 2 }), reason: 'RetryStrategyBuilder is already used for something else in this file' }])
    expect(clash.text).toBe(text.replace('doubleCheck: true,\n', ''))
  })

  it('neither applies nor skips an edit whose text the code already holds', () => {
    const text = TS.replace('frequency: 10', 'frequency: Frequency.EVERY_10M').replace('{ ApiCheck }', '{ ApiCheck, Frequency }')
    const result = apply('a.ts', text, [frequency({ frequency: 10 }), { path: ['name'], value: 'API' }])
    expect(result.applied).toEqual([])
    expect(result.skipped).toEqual([])
    expect(result.text).toBe(text)
  })

  it('reports a rejected sibling insertion and a refused import without leaving a dangling import', () => {
    const text = `import { ApiCheck } from 'checkly/constructs'\nimport { Frequency } from './mine.js'\nnew ApiCheck('api', { name: 'x' })\n`
    const result = apply('a.ts', text, [frequency({ frequency: 5 }), retry(null)])
    expect(result.applied.map(edit => edit.rendered)).toEqual(['RetryStrategyBuilder.noRetries()'])
    expect(result.skipped.map(edit => edit.reason)).toEqual(['Frequency is already used for something else in this file'])
    expect(result.imports).toEqual(['RetryStrategyBuilder'])
    expect(result.text).toBe(`import { ApiCheck, RetryStrategyBuilder } from 'checkly/constructs'\nimport { Frequency } from './mine.js'\nnew ApiCheck('api', { name: 'x', retryStrategy: RetryStrategyBuilder.noRetries() })\n`)
  })

  it('writes and reads back an assertion the codegen spells as an object holding null', () => {
    const value = [{ source: 'GRPC_HEALTHCHECK_STATUS', comparison: 'EQUALS', target: '99', property: '', regex: null }]
    const result = apply('a.ts', TS, [assertions(value, 'GrpcAssertionBuilder')])
    expect(result.skipped).toEqual([])
    expect(result.text).toContain(`    assertions: [
      {
        source: 'GRPC_HEALTHCHECK_STATUS',
        comparison: 'EQUALS',
        target: '99',
        property: '',
        regex: null,
      },
    ],
`)
    // The builder is not referenced, so it is not imported either.
    expect(result.imports).toEqual([])
    expect(result.text).not.toContain('GrpcAssertionBuilder')
    const reparsed = findConstructOptions(parseSource('a.ts', result.text), 'api', NAMES)
    expect(readsBack(reparsed, result.applied[0])).toBe(true)
    // And the same object is replaceable on a later run.
    expect(apply('a.ts', result.text, [assertions([], 'GrpcAssertionBuilder')]).applied[0]?.rendered).toBe('[]')
  })

  it('refuses an edit beside a spread, and replaces assertions spelled with another builder', () => {
    const spread = `import { ApiCheck } from 'checkly/constructs'\nconst base = {}\nnew ApiCheck('api', { ...base, retryStrategy: null })\n`
    expect(() => apply('a.ts', spread, [retry(null)])).toThrow('its options spread another object')
    const nested = `import { ApiCheck } from 'checkly/constructs'\nconst base = {}\nnew ApiCheck('api', { request: { ...base, assertions: [] } })\n`
    const withUnless: HelperEdit = { ...assertions([]), unless: ['x'] }
    expect(apply('a.ts', nested, [withUnless]).skipped[0]?.reason).toBe('a spread is set in the code; replace it with request.assertions by hand')
    const other = `import { ApiCheck, UrlAssertionBuilder } from 'checkly/constructs'
new ApiCheck('api', { request: { assertions: [UrlAssertionBuilder.statusCode().equals(200)] } })
`
    const result = apply('a.ts', other, [assertions([{ source: 'STATUS_CODE', comparison: 'EQUALS', target: '201', property: '', regex: null }])])
    expect(result.applied[0]?.rendered).toBe('[AssertionBuilder.statusCode().equals(201)]')
    expect(result.imports).toEqual(['AssertionBuilder'])
  })

  it('treats an expression the code already holds in another spelling as nothing to do', () => {
    const text = `import { ApiCheck, RetryStrategyBuilder } from 'checkly/constructs'
new ApiCheck('api', { retryStrategy: RetryStrategyBuilder.fixedStrategy({ sameRegion: false, maxRetries: 3 }) })
`
    const result = apply('a.ts', text, [retry({ type: 'FIXED', maxRetries: 3, sameRegion: false })])
    expect(result.applied).toEqual([])
    expect(result.skipped).toEqual([])
    expect(result.text).toBe(text)
  })

  it('renders what sourcegen would print, up to the style', () => {
    // sourcegen prints with two spaces, LF, single quotes and a trailing comma on every block member.
    const edits: HelperEdit[] = [
      retry({ type: 'LINEAR', baseBackoffSeconds: 10, maxRetries: 3, sameRegion: false, onlyOn: 'NETWORK_ERROR' }),
      escalation({ escalationType: 'RUN_BASED', runBasedEscalation: { failedRunThreshold: 3 }, reminders: { amount: 2, interval: 10 } }),
      assertions([{ source: 'JSON_BODY', property: '$.a', comparison: 'EQUALS', target: 'x', regex: null }]),
      frequency({ frequency: 0, frequencyOffset: 15 }),
    ]
    for (const edit of edits) {
      const { value } = buildHelperValue(edit)
      const output = new Output()
      value.render(output)
      expect(renderExpression(value, STYLE, { column: '', inline: false, trailingComma: true, locals: new Map() }))
        .toBe(output.finalize().trimEnd())
    }
  })

  it('writes a date over a Date expression or a string, without an import, and not over a variable', () => {
    const text = `import { ApiCheck } from 'checkly/constructs'
const when = new Date()
new ApiCheck('api', {
  startsAt: new Date('2026-01-01T00:00:00Z'),
  endsAt: '2026-01-02T00:00:00.000Z',
  repeatEndsAt: when,
})
`
    const result = apply('a.ts', text, [
      date('2026-01-01T00:00:00.000Z'),
      { path: ['endsAt'], value: '2026-01-03T00:00:00.000Z', helper: 'date' },
      { path: ['repeatEndsAt'], value: '2026-01-04T00:00:00.000Z', helper: 'date' },
      { path: ['name'], value: '2026-01-05T00:00:00.000Z', helper: 'date' },
    ])
    expect(result.applied.map(edit => [edit.path.join('.'), edit.rendered])).toEqual([
      ['startsAt', 'new Date(\'2026-01-01T00:00:00.000Z\')'],
      ['endsAt', 'new Date(\'2026-01-03T00:00:00.000Z\')'],
      ['name', 'new Date(\'2026-01-05T00:00:00.000Z\')'],
    ])
    expect(result.skipped.map(edit => [edit.path.join('.'), edit.reason])).toEqual([
      ['repeatEndsAt', 'repeatEndsAt is the variable when, not a literal or a Date expression'],
    ])
    expect(result.imports).toEqual([])
    expect(result.text).toContain('  startsAt: new Date(\'2026-01-01T00:00:00.000Z\'),\n  endsAt: new Date(\'2026-01-03T00:00:00.000Z\'),')
    const reparsed = findConstructOptions(parseSource('a.ts', result.text), 'api', NAMES)
    expect(result.applied.every(edit => readsBack(reparsed, edit))).toBe(true)
    // A file that binds `Date` to something of its own does not hold the global.
    const shadowed = apply('a.ts', text.replace('const when = new Date()', 'import { Date } from \'./dates.js\''), [
      date('2026-01-01T00:00:00.000Z'),
    ])
    expect(shadowed.applied).toEqual([])
    expect(shadowed.skipped.map(edit => edit.reason)).toEqual(['Date is bound to something else in this file'])
  })

  it('works through acorn for JavaScript files with a require', () => {
    const text = `const { ApiCheck } = require('checkly/constructs')\nnew ApiCheck('api', { frequency: 10 })\n`
    const result = apply('a.js', text, [frequency({ frequency: 0, frequencyOffset: 20 })])
    expect(result.text).toBe(`const { ApiCheck, Frequency } = require('checkly/constructs')\nnew ApiCheck('api', { frequency: Frequency.EVERY_20S })\n`)
  })
})
