import { describe, expect, it } from 'vitest'

import { envelopeEndpoint, eventId, parseStack, serializeEventEnvelope, type ErrorEvent } from '../sentry-protocol.js'

// The expected values are what @sentry/core 11 produced for the same input,
// except where a test says otherwise: only lines starting with `at` are
// frames, and only file URLs are decoded.
describe('parseStack', () => {
  it('returns the frames outermost first', () => {
    const frames = parseStack([
      'TypeError: boom',
      '    at inner (/abs/inner.js:1:2)',
      '    at outer (/abs/outer.js:3:4)',
    ].join('\n'))
    expect(frames).toEqual([
      { filename: '/abs/outer.js', function: 'outer', lineno: 3, colno: 4 },
      { filename: '/abs/inner.js', function: 'inner', lineno: 1, colno: 2 },
    ])
  })

  it('turns file URLs into paths, with spaces and Windows drives', () => {
    const [windows, posix] = parseStack([
      '    at Deploy.run (file:///Users/ann/my%20cli/dist/commands/deploy.js:12:34)',
      '    at async Deploy._run (file:///C:/Users/Ann%20Lee/cli/dist/x.js:1:1)',
    ].join('\n'))
    expect(posix).toMatchObject({ filename: '/Users/ann/my cli/dist/commands/deploy.js', function: 'Deploy.run' })
    expect(windows).toMatchObject({ filename: 'C:/Users/Ann Lee/cli/dist/x.js', function: 'Deploy._run' })
  })

  it('decodes every character a file URL encodes, also # and ?', () => {
    const [frame] = parseStack('    at run (file:///Users/ann/C%23/a%3Fb/node_modules/checkly/dist/x.js:1:2)')
    expect(frame.filename).toBe('/Users/ann/C#/a?b/node_modules/checkly/dist/x.js')
  })

  it('reads a frame without a function name whose path holds a parenthesis', () => {
    const [frame] = parseStack('    at /Users/ann/My Stuff (old)/proj/node_modules/axios/lib/x.js:1:2')
    expect(frame).toEqual({
      filename: '/Users/ann/My Stuff (old)/proj/node_modules/axios/lib/x.js', function: '?', lineno: 1, colno: 2,
    })
  })

  it('keeps native Windows paths as they are', () => {
    expect(parseStack('    at run (C:\\Users\\Ann Lee\\cli\\dist\\y.js:5:6)')).toEqual([
      { filename: 'C:\\Users\\Ann Lee\\cli\\dist\\y.js', function: 'run', lineno: 5, colno: 6 },
    ])
  })

  it('names constructors, anonymous functions and frames without a function', () => {
    const frames = parseStack([
      '    at new Foo (/abs/foo.js:7:8)',
      '    at Object.<anonymous> (/abs/cjs.js:1:1)',
      '    at /abs/anon.js:2:3',
    ].join('\n')).reverse()
    expect(frames.map(frame => frame.function)).toEqual(['new Foo', 'Object.?', '?'])
    expect(frames[2].filename).toBe('/abs/anon.js')
  })

  it('keeps the eval origin as the filename of an eval frame', () => {
    expect(parseStack('    at eval (eval at load (/abs/loader.js:1:2), <anonymous>:1:1)')).toEqual([
      { filename: 'eval at load (/abs/loader.js:1:2), <anonymous>', function: 'eval', lineno: 1, colno: 1 },
    ])
  })

  it('keeps frames without a line, and Node\'s own frames', () => {
    const frames = parseStack([
      '    at Array.map (<anonymous>)',
      '    at async Promise.all (index 0)',
      '    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)',
    ].join('\n')).reverse()
    expect(frames).toEqual([
      { filename: '<anonymous>', function: 'Array.map' },
      { filename: 'index 0', function: 'Promise.all' },
      {
        filename: 'node:internal/process/task_queues',
        function: 'process.processTicksAndRejections',
        lineno: 95,
        colno: 5,
      },
    ])
  })

  it('skips lines that are not frames, even a message line that mentions one', () => {
    const frames = parseStack([
      'TypeError: Cannot read properties of undefined (reading \'x\')',
      'second message line at foo (/tmp/msg.js:1:2)',
      '',
      '    at run (/abs/run.js:1:1)',
    ].join('\n'))
    expect(frames.map(frame => frame.filename)).toEqual(['/abs/run.js'])
  })

  it('skips lines too long to parse rather than cutting them', () => {
    const frames = parseStack([
      `    at fn (/abs/${'a'.repeat(1100)}/node_modules/dep/x.js:1:2)`,
      '    at run (/abs/run.js:1:1)',
    ].join('\n'))
    expect(frames.map(frame => frame.filename)).toEqual(['/abs/run.js'])
  })
})

describe('eventId', () => {
  it('is 32 hex characters', () => {
    expect(eventId()).toMatch(/^[0-9a-f]{32}$/)
  })
})

describe('envelopeEndpoint', () => {
  it('builds the ingest URL with the key in the query string', () => {
    expect(envelopeEndpoint('https://aaaaaaaa@ingest.example.com:8443/sub/path/123'))
      .toBe('https://ingest.example.com:8443/sub/path/api/123/envelope/?sentry_version=7&sentry_key=aaaaaaaa')
    expect(envelopeEndpoint('http://key@127.0.0.1:9/123'))
      .toBe('http://127.0.0.1:9/api/123/envelope/?sentry_version=7&sentry_key=key')
  })

  it.each(['ftp://k@h/1', 'https://h/1', 'https://k@h/abc', 'https://k@h/1/', 'not a dsn'])(
    'rejects %s', dsn => {
      expect(envelopeEndpoint(dsn)).toBeUndefined()
    })
})

describe('serializeEventEnvelope', () => {
  it('writes the envelope headers, the item header and the event, one per line', () => {
    const event = { event_id: 'e'.repeat(32), level: 'error' } as ErrorEvent
    const lines = serializeEventEnvelope(event, { name: 'checkly-cli', version: '7.1.0' }).split('\n')

    expect(lines).toHaveLength(3)
    const [headers, itemHeaders, payload] = lines.map(line => JSON.parse(line))
    expect(headers).toEqual({
      event_id: 'e'.repeat(32),
      sent_at: expect.stringMatching(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/),
      sdk: { name: 'checkly-cli', version: '7.1.0' },
    })
    expect(itemHeaders).toEqual({ type: 'event' })
    expect(payload).toEqual({
      event_id: 'e'.repeat(32),
      level: 'error',
      sdk: { name: 'checkly-cli', version: '7.1.0', integrations: [], packages: [] },
    })
  })
})
