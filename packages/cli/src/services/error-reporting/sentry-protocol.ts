import { randomUUID } from 'node:crypto'

// The parts of the Sentry protocol the CLI's crash reports need: Checkly's
// ingest accepts Sentry envelopes. https://develop.sentry.dev/sdk/data-model/

export interface StackFrame {
  filename?: string
  function?: string
  lineno?: number
  colno?: number
  in_app?: boolean
}

export interface Exception {
  type: string
  value: string
  stacktrace?: { frames: StackFrame[] }
  mechanism: { type: string, handled: boolean }
}

export interface ErrorEvent {
  event_id: string
  timestamp: number
  platform: string
  level: 'error' | 'fatal'
  release: string
  environment: string
  exception: { values: Exception[] }
  tags: Record<string, string>
  contexts: Record<string, Record<string, string>>
}

export interface SdkInfo {
  name: string
  version: string
}

// More frames than Node records by default (10), and enough for a report.
const MAX_FRAMES = 50

// Longer lines are skipped, to bound the regular expression's work. Cutting
// them instead would turn a long path into a shorter, wrong one.
const MAX_LINE_LENGTH = 1024

// A V8 stack line: `at [async] [function (]location[)]`, where the location is
// `file:line:column`, or e.g. `<anonymous>`, `native` or `index 0` without one.
const FRAME_LINE = /^\s*at (?:async )?(?:(.+?)\s+\()?(?:(.+):(\d+):(\d+)?|([^)]+))\)?/

/** A frame's file as a path: `file:///C:/Ann%20Lee/x.js` is `C:/Ann Lee/x.js`. Other names stay as they are. */
function framePath (location: string): string {
  if (!location.startsWith('file://')) return location
  let file = location.slice('file://'.length)
  if (/^\/[A-Za-z]:/.test(file)) file = file.slice(1)
  try {
    // Not decodeURI, which leaves `%23` and `%3F` for `#` and `?` encoded.
    return decodeURIComponent(file)
  } catch {
    return file
  }
}

/** `?` for a function V8 has no name for, as in `Object.<anonymous>`. */
function functionName (name: string | undefined): string {
  if (!name) return '?'
  return name.endsWith('.<anonymous>') ? `${name.slice(0, -'<anonymous>'.length)}?` : name
}

function parseFrame (line: string): StackFrame | undefined {
  if (line.length > MAX_LINE_LENGTH) return undefined
  const match = FRAME_LINE.exec(line)
  if (!match) return undefined
  const [, name, file, lineno, colno, location] = match
  const where = file ?? (location === 'native' ? undefined : location)
  return {
    filename: where && framePath(where),
    function: functionName(name),
    lineno: Number(lineno) || undefined,
    colno: Number(colno) || undefined,
  }
}

/**
 * The frames of a V8 `err.stack`, outermost first as Sentry expects them.
 * Lines that are not frames, such as the message, are skipped.
 */
export function parseStack (stack: string): StackFrame[] {
  const frames: StackFrame[] = []
  for (const line of stack.split('\n')) {
    const frame = parseFrame(line)
    if (frame) frames.push(frame)
    if (frames.length >= MAX_FRAMES) break
  }
  return frames.reverse()
}

/** A Sentry event id: 32 hex characters. */
export function eventId (): string {
  return randomUUID().replace(/-/g, '')
}

/**
 * The URL to post envelopes to for a DSN `https://<key>@<host>[/<path>]/<project>`,
 * with the key in the query string, or `undefined` for a DSN that is not one.
 */
export function envelopeEndpoint (dsn: string): string | undefined {
  let url: URL
  try {
    url = new URL(dsn)
  } catch {
    return undefined
  }
  const segments = url.pathname.slice(1).split('/')
  const projectId = /^\d+/.exec(segments.pop() ?? '')?.[0]
  if (!['http:', 'https:'].includes(url.protocol) || !url.username || !projectId) return undefined
  const path = segments.length ? `/${segments.join('/')}` : ''
  const query = new URLSearchParams({ sentry_version: '7', sentry_key: url.username })
  return `${url.protocol}//${url.host}${path}/api/${projectId}/envelope/?${query}`
}

/** An envelope holding just `event`: its headers, the item's header and the event, one JSON document per line. */
export function serializeEventEnvelope (event: ErrorEvent, sdk: SdkInfo): string {
  const headers = { event_id: event.event_id, sent_at: new Date().toISOString(), sdk }
  const payload = { ...event, sdk: { ...sdk, integrations: [], packages: [] } }
  return [headers, { type: 'event' }, payload].map(part => JSON.stringify(part)).join('\n')
}
