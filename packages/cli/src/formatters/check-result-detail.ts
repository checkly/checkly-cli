import chalk from 'chalk'
import type {
  CheckResult,
  ApiCheckResult,
  BrowserCheckResult,
  MultiStepCheckResult,
  WebVitalEntry,
  AgenticCheckResult,
  AgenticAssertion,
  AgenticSuggestion,
  AgenticStep,
  TracerouteCheckResult,
  GrpcCheckResult,
  SslCheckResult,
} from '../rest/check-results.js'
import {
  type OutputFormat,
  type DetailField,
  type CommandHint,
  type ColumnDef,
  formatMs,
  formatDate,
  resolveResultStatus,
  heading,
  escapeMdCell,
  renderDetailFields,
  renderCommandHints,
  renderAdaptiveTable,
  truncateSingleLine,
  stripAnsi,
} from './render.js'
import { assertionSymbols, type AssertionLike, formatAssertionLine } from './assertion-line.js'

// --- Helpers ---

function label (text: string, width = 16): string {
  return chalk.dim(text.padEnd(width))
}

export function formatResultDetailWithNavigation (
  result: CheckResult,
  format: OutputFormat,
  hints: CommandHint[],
  extraSections: string[] = [],
): string {
  const output = [formatResultDetail(result, format)]

  for (const section of extraSections) {
    if (section) {
      output.push('')
      output.push(section)
    }
  }

  if (hints.length > 0) {
    output.push('')
    output.push(renderCommandHints(hints))
  }

  return output.join('\n')
}

// --- Retry attempts ---

// Picks the runs sharing a sequenceId out of a resultType=ALL page (there's no
// server-side sequenceId filter), oldest-first so the index is the run number.
export function groupAttemptsBySequence (results: CheckResult[], sequenceId: string): CheckResult[] {
  return results
    .filter(r => r.sequenceId === sequenceId)
    .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime())
}

export interface AttemptsContext {
  finalId?: string // marked "final"
  requestedId?: string // the --result row, marked as current
}

interface AttemptRow {
  result: CheckResult
  runNumber: number
  isFinal: boolean
  isRequested: boolean
}

// Best-effort short error summary; list rows aren't hydrated with logs/assets,
// so fall back to the status flags. Empty string means "no error detail".
export function extractResultErrorSummary (result: CheckResult): string {
  const raw = firstErrorMessage(result)
  if (raw) return raw
  if (result.hasErrors) return 'error'
  if (result.hasFailures) return 'failed'
  return ''
}

function firstErrorMessage (result: CheckResult): string {
  const api = result.apiCheckResult
  if (api?.requestError) return api.requestError
  const browserErr = result.browserCheckResult?.errors?.find(Boolean)
  if (browserErr) return formatErrorEntry(browserErr)
  const multiStepErr = result.multiStepCheckResult?.errors?.find(Boolean)
  if (multiStepErr) return formatErrorEntry(multiStepErr)
  const agenticErr = result.agenticCheckResult?.errors
    ?.map(e => e?.error?.message ?? '')
    .find(m => m.length > 0)
  if (agenticErr) return agenticErr
  const tracerouteErr = result.tracerouteCheckResult?.requestError
  if (tracerouteErr) return tracerouteErr
  const grpcErr = result.grpcCheckResult?.requestError
    ?? result.grpcCheckResult?.response?.grpcStatusMessage
  if (grpcErr) return grpcErr
  const sslErr = result.sslCheckResult?.requestError ?? result.sslCheckResult?.failureCategory
  if (sslErr) return sslErr
  return ''
}

// Renders the retry table for a sequence; `attempts` must be oldest-first.
export function formatAttemptsSection (
  attempts: CheckResult[],
  format: OutputFormat,
  context: AttemptsContext = {},
): string {
  if (attempts.length === 0) return ''

  const rows: AttemptRow[] = attempts.map((result, i) => ({
    result,
    runNumber: i + 1,
    isFinal: result.resultType === 'FINAL' || result.id === context.finalId,
    isRequested: result.id === context.requestedId,
  }))

  const columns = buildAttemptColumns(format)
  const table = renderAdaptiveTable(columns, rows, format)

  return format === 'md'
    ? '## Attempts\n\n' + table
    : chalk.bold('ATTEMPTS') + '\n' + table
}

function buildAttemptColumns (format: OutputFormat): ColumnDef<AttemptRow>[] {
  if (format === 'md') {
    return [
      { header: '#', value: row => row.isFinal ? `${row.runNumber} (FINAL)` : String(row.runNumber) },
      { header: 'Status', value: (row, fmt) => resolveResultStatus(row.result, fmt) },
      { header: 'Location', value: row => row.result.runLocation },
      { header: 'Duration', value: row => formatMs(row.result.responseTime) },
      { header: 'Error', value: row => mdErrorCell(row.result) },
      { header: 'Result ID', value: row => row.result.id },
    ]
  }

  return [
    {
      header: '#',
      width: 14,
      value: row => {
        const marker = row.isFinal ? chalk.dim(' (FINAL)') : ''
        const current = row.isRequested ? chalk.cyan(' ‹') : ''
        return String(row.runNumber) + marker + current
      },
    },
    { header: 'Status', width: 10, value: (row, fmt) => resolveResultStatus(row.result, fmt) },
    { header: 'Location', minWidth: 8, maxWidth: 16, value: row => row.result.runLocation },
    { header: 'Duration', width: 10, value: row => formatMs(row.result.responseTime) },
    {
      header: 'Error',
      minWidth: 12,
      maxWidth: 50,
      value: row => {
        const msg = extractResultErrorSummary(row.result)
        return msg ? chalk.red(truncateSingleLine(msg, 50)) : chalk.dim('—')
      },
    },
    { header: 'Result ID', minWidth: 12, maxWidth: 38, value: row => chalk.dim(row.result.id) },
  ]
}

function mdErrorCell (result: CheckResult): string {
  const msg = extractResultErrorSummary(result)
  if (!msg) return '—'
  return escapeMdCell(truncateSingleLine(msg, 80))
}

// --- Top-level result detail fields ---

export const resultDetailFields: DetailField<CheckResult>[] = [
  { label: 'Status', value: (r, fmt) => resolveResultStatus(r, fmt) },
  { label: 'Location', value: r => r.runLocation },
  { label: 'Response time', value: r => formatMs(r.responseTime) },
  { label: 'Started', value: (r, fmt) => fmt === 'md' ? (r.startedAt || '-') : formatDate(r.startedAt, fmt) },
  { label: 'Stopped', value: (r, fmt) => fmt === 'md' ? (r.stoppedAt || '-') : formatDate(r.stoppedAt, fmt) },
  { label: 'Attempts', value: r => String(r.attempts) },
  { label: 'Result type', value: r => r.resultType },
  { label: 'ID', value: r => r.id },
]

export function formatResultDetail (result: CheckResult, format: OutputFormat): string {
  const parts: string[] = [renderDetailFields(result.name, resultDetailFields, result, format)]

  if (result.apiCheckResult) {
    const subLines = format === 'md'
      ? formatApiResultMd(result.apiCheckResult)
      : formatApiResultTerminal(result.apiCheckResult)
    parts.push(subLines.join('\n'))
  }

  if (result.browserCheckResult) {
    const subLines = format === 'md'
      ? formatBrowserResultMd(result.browserCheckResult)
      : formatBrowserResultTerminal(result.browserCheckResult)
    parts.push(subLines.join('\n'))
  }

  if (result.multiStepCheckResult && format === 'terminal') {
    parts.push(formatMultiStepResultTerminal(result.multiStepCheckResult).join('\n'))
  }

  if (result.agenticCheckResult) {
    const subLines = format === 'md'
      ? formatAgenticResultMd(result.agenticCheckResult)
      : formatAgenticResultTerminal(result.agenticCheckResult)
    parts.push(subLines.join('\n'))
  }

  if (result.tracerouteCheckResult) {
    const subLines = format === 'md'
      ? formatTracerouteResultMd(result.tracerouteCheckResult)
      : formatTracerouteResultTerminal(result.tracerouteCheckResult)
    parts.push(subLines.join('\n'))
  }

  if (result.grpcCheckResult) {
    const subLines = format === 'md'
      ? formatGrpcResultMd(result.grpcCheckResult)
      : formatGrpcResultTerminal(result.grpcCheckResult)
    parts.push(subLines.join('\n'))
  }

  if (result.sslCheckResult) {
    const subLines = format === 'md'
      ? formatSslResultMd(result.sslCheckResult)
      : formatSslResultTerminal(result.sslCheckResult)
    parts.push(subLines.join('\n'))
  }

  return parts.join('\n\n')
}

// --- API check result (terminal) ---

function formatApiResultTerminal (api: ApiCheckResult): string[] {
  const lines: string[] = []

  lines.push(heading('REQUEST', 2, 'terminal'))
  lines.push(`${label('Method:')}${api.request.method}`)
  lines.push(`${label('URL:')}${api.request.url}`)

  const reqHeaders = Object.entries(api.request.headers || {})
  if (reqHeaders.length > 0) {
    lines.push(`${label('Headers:')}`)
    for (const [key, val] of reqHeaders) {
      lines.push(`  ${chalk.dim(key + ':')} ${val}`)
    }
  }

  if (api.request.data) {
    lines.push(`${label('Body:')}`)
    lines.push(formatBody(api.request.data, '  '))
  }

  lines.push('')
  lines.push(heading('RESPONSE', 2, 'terminal'))
  const reasonPhrase = (api.response.statusText || '').replace(/^\d+\s*/, '')
  lines.push(`${label('Status:')}${colorStatus(api.response.status)} ${reasonPhrase}`)

  const respHeaders = Object.entries(api.response.headers || {})
  if (respHeaders.length > 0) {
    lines.push(`${label('Headers:')}`)
    for (const [key, val] of respHeaders) {
      lines.push(`  ${chalk.dim(key + ':')} ${val}`)
    }
  }

  if (api.response.body) {
    lines.push(`${label('Body:')}`)
    lines.push(formatBody(api.response.body, '  '))
  }

  if (api.response.timingPhases) {
    lines.push('')
    lines.push(heading('TIMING', 2, 'terminal'))
    lines.push(formatTimingBar(api.response.timingPhases))
  }

  if (api.assertions && api.assertions.length > 0) {
    lines.push('')
    lines.push(heading('ASSERTIONS', 2, 'terminal'))
    for (const a of api.assertions) {
      const src = a.property ? `${a.source}.${a.property}` : a.source
      lines.push(`  ${chalk.dim('·')} ${src} ${a.comparison} ${a.target}`)
    }
  }

  if (api.requestError) {
    lines.push('')
    lines.push(heading('ERROR', 2, 'terminal'))
    lines.push(chalk.red(`  ${api.requestError}`))
  }

  if (api.jobLog) {
    lines.push('')
    lines.push(...formatJobLogObject(api.jobLog))
  }

  return lines
}

// --- API check result (markdown) ---

function formatApiResultMd (api: ApiCheckResult): string[] {
  const lines: string[] = []

  lines.push('## Request')
  lines.push(`\`${api.request.method} ${api.request.url}\``)

  lines.push('')
  lines.push('## Response')
  const mdReason = (api.response.statusText || '').replace(/^\d+\s*/, '')
  lines.push(`**${api.response.status} ${mdReason}**`)

  if (api.response.body) {
    lines.push('')
    lines.push('```json')
    lines.push(api.response.body.slice(0, 2000))
    lines.push('```')
  }

  if (api.response.timingPhases) {
    const tp = api.response.timingPhases
    lines.push('')
    lines.push('## Timing')
    lines.push('| Phase | Duration |')
    lines.push('| --- | --- |')
    lines.push(`| DNS | ${formatMs(tp.dns)} |`)
    lines.push(`| TCP | ${formatMs(tp.tcp)} |`)
    lines.push(`| TLS | ${formatMs(tp.wait)} |`)
    lines.push(`| TTFB | ${formatMs(tp.firstByte)} |`)
    lines.push(`| Download | ${formatMs(tp.download)} |`)
    lines.push(`| **Total** | **${formatMs(tp.total)}** |`)
  }

  if (api.assertions && api.assertions.length > 0) {
    lines.push('')
    lines.push('## Assertions')
    for (const a of api.assertions) {
      const src = a.property ? `${a.source}.${a.property}` : a.source
      lines.push(`- ${src} ${a.comparison} ${a.target}`)
    }
  }

  return lines
}

// --- Browser check result (terminal) ---

function formatBrowserResultTerminal (browser: BrowserCheckResult): string[] {
  const lines: string[] = []

  lines.push(heading('BROWSER RESULT', 2, 'terminal'))
  lines.push(`${label('Framework:')}${browser.type}`)
  lines.push(`${label('Runtime:')}${browser.runtimeVersion}`)

  const ts = browser.traceSummary
  const errorCounts = ts
    ? [
        ts.userScriptErrors > 0 ? `${ts.userScriptErrors} script` : null,
        ts.consoleErrors > 0 ? `${ts.consoleErrors} console` : null,
        ts.networkErrors > 0 ? `${ts.networkErrors} network` : null,
        ts.documentErrors > 0 ? `${ts.documentErrors} document` : null,
      ].filter(Boolean)
    : []

  if (errorCounts.length > 0) {
    lines.push(`${label('Errors:')}${chalk.red(errorCounts.join(', '))}`)
  } else {
    lines.push(`${label('Errors:')}${chalk.green('none')}`)
  }

  appendErrors(lines, browser.errors)

  if (browser.pages && browser.pages.length > 0) {
    const vitalLines: string[] = []
    for (const page of browser.pages) {
      const pageLines: string[] = []
      const vitals = page.webVitals
      if (vitals) {
        const entries = Object.entries(vitals) as Array<[string, WebVitalEntry]>
        for (const [name, v] of entries) {
          if (v && v.value != null) {
            pageLines.push(`  ${label(name + ':', 8)}${formatVitalValue(name, v)} ${vitalScore(v.score)}`)
          }
        }
      }
      if (pageLines.length > 0) {
        if (browser.pages.length > 1) {
          vitalLines.push(`  ${chalk.dim(page.url)}`)
        }
        vitalLines.push(...pageLines)
      }
    }
    if (vitalLines.length > 0) {
      lines.push('')
      lines.push(heading('WEB VITALS', 2, 'terminal'))
      lines.push(...vitalLines)
    }
  }

  if (browser.jobLog && browser.jobLog.length > 0) {
    lines.push('')
    lines.push(...formatJobLogArray(browser.jobLog))
  }

  appendAssets(lines, browser)

  return lines
}

// --- Browser check result (markdown) ---

function formatBrowserResultMd (browser: BrowserCheckResult): string[] {
  const lines: string[] = []

  lines.push(`## Browser Result (${browser.type})`)

  if (browser.pages && browser.pages.length > 0) {
    lines.push('')
    lines.push('### Web Vitals')
    lines.push('| Metric | Value | Score |')
    lines.push('| --- | --- | --- |')
    for (const page of browser.pages) {
      if (page.webVitals) {
        for (const [name, v] of Object.entries(page.webVitals) as Array<[string, WebVitalEntry]>) {
          if (v && v.value != null) {
            lines.push(`| ${name} | ${formatVitalValue(name, v)} | ${v.score} |`)
          }
        }
      }
    }
  }

  if (browser.errors.length > 0) {
    lines.push('')
    lines.push('### Errors')
    for (const err of browser.errors) {
      lines.push(`- ${formatErrorEntry(err)}`)
    }
  }

  return lines
}

// --- Multi-step check result (terminal only — markdown has no special multi-step section) ---

function formatMultiStepResultTerminal (ms: MultiStepCheckResult): string[] {
  const lines: string[] = []

  lines.push(heading('MULTI-STEP RESULT', 2, 'terminal'))
  lines.push(`${label('Runtime:')}${ms.runtimeVersion}`)

  appendErrors(lines, ms.errors)

  if (ms.jobLog && ms.jobLog.length > 0) {
    lines.push('')
    lines.push(...formatJobLogArray(ms.jobLog))
  }

  appendAssets(lines, ms)

  return lines
}

// --- Agentic check result (terminal) ---

function formatAgenticResultTerminal (agentic: AgenticCheckResult): string[] {
  const lines: string[] = []

  lines.push(heading('AGENTIC RESULT', 2, 'terminal'))

  if (agentic.summary) {
    lines.push(heading('SUMMARY', 2, 'terminal'))
    lines.push(...wrapText(agentic.summary, '  ', 100))
  }

  if (agentic.assertions && agentic.assertions.length > 0) {
    lines.push('')
    lines.push(heading('ASSERTIONS', 2, 'terminal'))
    for (const assertion of agentic.assertions) {
      lines.push(formatAgenticAssertionTerminal(assertion))
    }
  }

  if (agentic.errors && agentic.errors.length > 0) {
    const messages = agentic.errors
      .map(e => e?.error?.message ?? '')
      .filter((m): m is string => m.length > 0)
    if (messages.length > 0) {
      lines.push('', heading('ERRORS', 2, 'terminal'))
      for (const msg of messages) lines.push(chalk.red(`  ${msg}`))
    }
  }

  if (agentic.steps && agentic.steps.length > 0) {
    lines.push('')
    lines.push(heading('STEPS', 2, 'terminal'))
    lines.push(chalk.dim(`  ${agentic.steps.length} step${agentic.steps.length === 1 ? '' : 's'} recorded`))
    const preview = agentic.steps.slice(0, 10)
    for (const step of preview) {
      lines.push(formatAgenticStepTerminal(step))
    }
    if (agentic.steps.length > preview.length) {
      lines.push(chalk.dim(`  ... (${agentic.steps.length - preview.length} more step${agentic.steps.length - preview.length === 1 ? '' : 's'})`))
    }
  }

  if (agentic.suggestions && agentic.suggestions.length > 0) {
    lines.push('')
    lines.push(heading('SUGGESTIONS', 2, 'terminal'))
    for (const suggestion of agentic.suggestions) {
      lines.push(...formatAgenticSuggestionTerminal(suggestion))
    }
  }

  if (agentic.jobLog && Array.isArray(agentic.jobLog) && agentic.jobLog.length > 0) {
    lines.push('')
    lines.push(...formatJobLogArray(agentic.jobLog as Array<{ time: number, msg: string, level: string }>))
  }

  return lines
}

function formatAgenticAssertionTerminal (assertion: AgenticAssertion): string {
  const status = assertion.passed ? chalk.green('✓') : chalk.red('✗')
  const condition = assertion.condition ?? '(no condition)'
  const suffix = assertion.passed
    ? ''
    : chalk.dim(`  expected ${JSON.stringify(assertion.expected ?? '')}, got ${JSON.stringify(assertion.actual ?? '')}`)
  return `  ${status} ${condition}${suffix}`
}

function formatAgenticStepTerminal (step: AgenticStep): string {
  const seq = step.sequenceNumber != null ? chalk.dim(String(step.sequenceNumber).padStart(3)) : chalk.dim('  ·')
  if (step.type === 'tool_call') {
    const name = step.name ?? '(tool)'
    return `  ${seq} ${chalk.cyan('→')} ${name}`
  }
  if (step.type === 'tool_result') {
    const name = step.name ?? '(tool)'
    return `  ${seq} ${chalk.dim('←')} ${chalk.dim(name)}`
  }
  // 'message' type
  const preview = truncateSingleLine(step.output ?? '', 100)
  return `  ${seq} ${chalk.dim('•')} ${preview}`
}

function formatAgenticSuggestionTerminal (suggestion: AgenticSuggestion): string[] {
  const lines: string[] = []
  const category = suggestion.category ? chalk.dim(`[${suggestion.category}]`) : ''
  const summary = suggestion.summary ?? '(no summary)'
  lines.push(`  ${chalk.yellow('◆')} ${summary} ${category}`.trimEnd())
  if (suggestion.secrets && suggestion.secrets.length > 0) {
    lines.push(chalk.dim(`     needs: ${suggestion.secrets.join(', ')}`))
  }
  return lines
}

// --- Agentic check result (markdown) ---

function formatAgenticResultMd (agentic: AgenticCheckResult): string[] {
  const lines: string[] = []

  lines.push('## Agentic Result')

  if (agentic.summary) {
    lines.push('')
    lines.push('### Summary')
    lines.push(agentic.summary)
  }

  if (agentic.assertions && agentic.assertions.length > 0) {
    lines.push('')
    lines.push('### Assertions')
    lines.push('| Status | Condition | Expected | Actual |')
    lines.push('| --- | --- | --- | --- |')
    for (const assertion of agentic.assertions) {
      const status = assertion.passed ? '✓' : '✗'
      const condition = assertion.condition ?? ''
      const expected = assertion.expected ?? ''
      const actual = assertion.actual ?? ''
      lines.push(`| ${status} | ${condition} | ${expected} | ${actual} |`)
    }
  }

  if (agentic.errors && agentic.errors.length > 0) {
    const messages = agentic.errors
      .map(e => e?.error?.message ?? '')
      .filter((m): m is string => m.length > 0)
    if (messages.length > 0) {
      lines.push('')
      lines.push('### Errors')
      for (const msg of messages) lines.push(`- ${msg}`)
    }
  }

  if (agentic.suggestions && agentic.suggestions.length > 0) {
    lines.push('')
    lines.push('### Suggestions')
    for (const suggestion of agentic.suggestions) {
      const category = suggestion.category ? ` _(${suggestion.category})_` : ''
      lines.push(`- **${suggestion.summary ?? '(no summary)'}**${category}`)
      if (suggestion.prompt) {
        lines.push(`  - Prompt fragment: \`${suggestion.prompt.replace(/\n/g, ' ')}\``)
      }
      if (suggestion.secrets && suggestion.secrets.length > 0) {
        lines.push(`  - Needs secrets: ${suggestion.secrets.map(s => `\`${s}\``).join(', ')}`)
      }
    }
  }

  if (agentic.steps && agentic.steps.length > 0) {
    lines.push('')
    lines.push(`### Steps (${agentic.steps.length})`)
    const preview = agentic.steps.slice(0, 20)
    for (const step of preview) {
      const seq = step.sequenceNumber != null ? `${step.sequenceNumber}. ` : '- '
      if (step.type === 'tool_call') {
        lines.push(`${seq}→ \`${step.name ?? '(tool)'}\``)
      } else if (step.type === 'tool_result') {
        lines.push(`${seq}← \`${step.name ?? '(tool)'}\``)
      } else {
        lines.push(`${seq}• ${truncateSingleLine(step.output ?? '', 200)}`)
      }
    }
    if (agentic.steps.length > preview.length) {
      lines.push(`- _... ${agentic.steps.length - preview.length} more step(s)_`)
    }
  }

  return lines
}

// --- Traceroute check result ---
//
// The diagnostic objects (tracerouteCheckResult/grpcCheckResult/sslCheckResult)
// carry documented top-level scalars plus a richer `response` artifact. The
// renderers prefer the top-level scalar but fall back to the artifact so a
// metadata-only uptime result still surfaces something useful.

function num (...vals: Array<unknown>): number | undefined {
  for (const v of vals) {
    if (typeof v === 'number' && !Number.isNaN(v)) return v
  }
  return undefined
}

function str (...vals: Array<unknown>): string | undefined {
  for (const v of vals) {
    if (typeof v === 'string' && v.length > 0) return v
  }
  return undefined
}

function boolFlag (...vals: Array<unknown>): boolean | undefined {
  for (const v of vals) {
    if (typeof v === 'boolean') return v
  }
  return undefined
}

function yesNo (value: boolean | undefined, { goodWhenTrue = true } = {}): string {
  if (value == null) return chalk.dim('—')
  const good = goodWhenTrue ? value : !value
  const text = value ? 'yes' : 'no'
  return good ? chalk.green(text) : chalk.red(text)
}

// finalHopLatency / RTT objects come straight from the runner artifact, where
// keys are snake_case (`avg_ms`/`best_ms`/`worst_ms`); accept the camelCase
// variants too in case a consumer reshapes the payload.
function formatLatencyStats (obj: unknown): string | undefined {
  if (!obj || typeof obj !== 'object') return undefined
  const o = obj as Record<string, unknown>
  const avg = num(o.avgMs, o.avg_ms, o.avg)
  const best = num(o.bestMs, o.best_ms, o.best)
  const worst = num(o.worstMs, o.worst_ms, o.worst)
  const parts = [
    avg != null ? `avg ${formatMs(avg)}` : null,
    best != null ? `best ${formatMs(best)}` : null,
    worst != null ? `worst ${formatMs(worst)}` : null,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(' / ') : undefined
}

// The SSL/gRPC/traceroute result bodies each carry an `assertions` array in the
// common assertion shape. Render them via the shared `formatAssertionLine`
// helper so the output matches the `checkly test` reporter exactly. Terminal
// output keeps the color/symbols from the helper; markdown strips ANSI so the
// list items stay plain text.
function appendAssertionsTerminal (
  lines: string[],
  assertions: Array<Record<string, unknown>> | null | undefined,
): void {
  if (!assertions || assertions.length === 0) return
  lines.push('')
  lines.push(heading('ASSERTIONS', 2, 'terminal'))
  for (const assertion of assertions) {
    lines.push(`  ${formatAssertionLine(assertion as AssertionLike)}`)
  }
}

function appendAssertionsMd (
  lines: string[],
  assertions: Array<Record<string, unknown>> | null | undefined,
): void {
  if (!assertions || assertions.length === 0) return
  lines.push('')
  lines.push('## Assertions')
  for (const assertion of assertions) {
    lines.push(`- ${stripAnsi(formatAssertionLine(assertion as AssertionLike))}`)
  }
}

function formatTracerouteResultTerminal (tr: TracerouteCheckResult): string[] {
  const lines: string[] = []
  const resp = tr.response ?? {}

  lines.push(heading('TRACEROUTE RESULT', 2, 'terminal'))

  const host = str(resp.hostname)
  const ip = str(resp.resolvedIp)
  if (host || ip) {
    const dest = [host, ip ? `(${ip})` : null].filter(Boolean).join(' ')
    lines.push(`${label('Destination:')}${dest}`)
  }
  const protocol = str(resp.protocol, resp.probeProtocol)
  if (protocol) lines.push(`${label('Protocol:')}${protocol}`)
  const probeProtocol = str(resp.probeProtocol)
  if (probeProtocol) lines.push(`${label('Probe protocol:')}${probeProtocol}`)

  const totalHops = num(tr.totalHops, resp.totalHops)
  if (totalHops != null) lines.push(`${label('Hops:')}${totalHops}`)

  const reached = boolFlag(tr.destinationReached, resp.destinationReached)
  lines.push(`${label('Reached:')}${yesNo(reached)}`)

  const truncation = str(resp.truncationReason)
  if (truncation) lines.push(`${label('Truncated:')}${chalk.yellow(truncation)}`)

  const finalHop = formatLatencyStats(tr.finalHopLatency ?? resp.finalHopLatency)
  if (finalHop) lines.push(`${label('Final hop:')}${finalHop}`)

  const hops = Array.isArray(resp.hops) ? resp.hops : []
  if (hops.length > 0) {
    lines.push('')
    lines.push(heading('HOPS', 2, 'terminal'))
    for (const hop of hops.slice(0, 40)) {
      lines.push(`  ${formatTracerouteHop(hop)}`)
    }
    if (hops.length > 40) {
      lines.push(chalk.dim(`  ... (${hops.length - 40} more hops)`))
    }
  }

  const trDns = num(asObject(tr.timingPhases)?.dns)
  if (trDns != null) {
    lines.push('')
    lines.push(heading('TIMING', 2, 'terminal'))
    lines.push(`${label('DNS:')}${formatMs(trDns)}`)
  }

  appendAssertionsTerminal(lines, tr.assertions)

  if (tr.requestError) {
    lines.push('')
    lines.push(heading('ERROR', 2, 'terminal'))
    lines.push(chalk.red(`  ${tr.requestError}`))
  }

  return lines
}

function formatTracerouteHop (hop: unknown): string {
  if (!hop || typeof hop !== 'object') return String(hop)
  const h = hop as Record<string, unknown>
  const n = num(h.hop_number, h.hopNumber, h.number, h.hop)
  const addr = str(h.main_ip, h.mainIp, h.ip, h.address) ?? '*'
  const host = str(h.main_host, h.mainHost, h.host)
  const loss = num(h.loss_percentage, h.lossPercentage, h.loss)
  const rtt = formatLatencyStats(h.rtt)
  const asn = num(h.asn)
  return [
    n != null ? chalk.dim(String(n).padStart(2)) : chalk.dim(' ·'),
    host ? `${addr} (${host})` : addr,
    loss != null ? `loss ${loss.toFixed(0)}%` : null,
    rtt ? `rtt ${rtt}` : null,
    asn ? chalk.dim(`AS${asn}`) : null,
  ].filter(Boolean).join('  ')
}

function formatTracerouteResultMd (tr: TracerouteCheckResult): string[] {
  const lines: string[] = ['## Traceroute Result']
  const resp = tr.response ?? {}

  const host = str(resp.hostname)
  const ip = str(resp.resolvedIp)
  if (host || ip) lines.push(`- **Destination:** ${[host, ip ? `(${ip})` : null].filter(Boolean).join(' ')}`)
  const probeProtocol = str(resp.probeProtocol)
  if (probeProtocol) lines.push(`- **Probe protocol:** ${probeProtocol}`)
  const totalHops = num(tr.totalHops, resp.totalHops)
  if (totalHops != null) lines.push(`- **Hops:** ${totalHops}`)
  const reached = boolFlag(tr.destinationReached, resp.destinationReached)
  if (reached != null) lines.push(`- **Reached:** ${reached ? 'yes' : 'no'}`)
  const truncation = str(resp.truncationReason)
  if (truncation) lines.push(`- **Truncated:** ${truncation}`)
  const finalHop = formatLatencyStats(tr.finalHopLatency ?? resp.finalHopLatency)
  if (finalHop) lines.push(`- **Final hop:** ${finalHop}`)
  const trDns = num(asObject(tr.timingPhases)?.dns)
  if (trDns != null) {
    lines.push('')
    lines.push('## Timing')
    lines.push(`- **DNS:** ${formatMs(trDns)}`)
  }
  appendAssertionsMd(lines, tr.assertions)
  if (tr.requestError) {
    lines.push('')
    lines.push('## Error')
    lines.push(`- ${tr.requestError}`)
  }

  return lines
}

// --- gRPC check result ---

function formatGrpcResultTerminal (grpc: GrpcCheckResult): string[] {
  const lines: string[] = []
  const resp = grpc.response ?? {}

  lines.push(heading('GRPC RESULT', 2, 'terminal'))

  const host = str(resp.host)
  const ip = str(resp.resolvedIp)
  const port = num(resp.port)
  if (host || ip || port != null) {
    const target = [
      host ?? ip,
      port != null ? `:${port}` : '',
    ].filter(Boolean).join('')
    lines.push(`${label('Target:')}${target}`)
  }
  const method = str(resp.grpcMethod)
  if (method) lines.push(`${label('Method:')}${method}`)
  const mode = str(resp.grpcMode)
  if (mode) lines.push(`${label('Mode:')}${mode}`)

  const code = num(grpc.grpcStatusCode, resp.grpcStatusCode)
  const statusMsg = str(resp.grpcStatusMessage)
  if (code != null) {
    const codeStr = code === 0 ? chalk.green(String(code)) : chalk.red(String(code))
    lines.push(`${label('Status:')}${codeStr}${statusMsg ? ` ${statusMsg}` : ''}`)
  }

  const healthLabel = str(resp.healthStatusLabel)
  const healthNum = num(grpc.healthStatus, resp.healthStatus)
  if (healthLabel || healthNum != null) {
    const display = healthLabel ?? String(healthNum)
    const colored = healthLabel === 'SERVING' ? chalk.green(display) : chalk.red(display)
    lines.push(`${label('Health:')}${colored}`)
  }

  const responseMessage = str(resp.responseMessage)
  if (responseMessage) lines.push(`${label('Response:')}${truncateSingleLine(responseMessage, 200)}`)

  const methods = Array.isArray(resp.discoveredMethods) ? resp.discoveredMethods : []
  if (methods.length > 0) {
    lines.push(`${label('Methods:')}${methods.slice(0, 20).join(', ')}${methods.length > 20 ? ', …' : ''}`)
  }

  const metadata = Array.isArray(resp.metadata) ? resp.metadata : []
  if (metadata.length > 0) {
    lines.push(`${label('Metadata:')}`)
    for (const entry of metadata.slice(0, 20)) {
      lines.push(`  ${formatKeyValueEntry(entry)}`)
    }
  }

  // Timing breakdown. gRPC exposes dns/connect/total (not the HTTP phases the
  // API TIMING bar renders), so surface those directly for parity with the API
  // result's timing detail instead of only the top-level total response time.
  const timing = (grpc.timingPhases ?? resp.timingPhases) as
    { dns?: number, connect?: number, total?: number } | undefined
  const tDns = num(timing?.dns), tConnect = num(timing?.connect), tTotal = num(timing?.total)
  if (tDns != null || tConnect != null || tTotal != null) {
    lines.push('')
    lines.push(heading('TIMING', 2, 'terminal'))
    if (tDns != null) lines.push(`${label('DNS:')}${formatMs(tDns)}`)
    if (tConnect != null) lines.push(`${label('Connect:')}${formatMs(tConnect)}`)
    if (tTotal != null) lines.push(`${label('Total:')}${formatMs(tTotal)}`)
  }

  appendAssertionsTerminal(lines, grpc.assertions)

  if (grpc.requestError) {
    lines.push('')
    lines.push(heading('ERROR', 2, 'terminal'))
    lines.push(chalk.red(`  ${grpc.requestError}`))
  }

  return lines
}

function formatKeyValueEntry (entry: unknown): string {
  if (!entry || typeof entry !== 'object') return String(entry)
  const e = entry as Record<string, unknown>
  const key = str(e.key, e.name) ?? '(key)'
  const value = e.value != null ? String(e.value) : ''
  return `${chalk.dim(key + ':')} ${value}`
}

function formatGrpcResultMd (grpc: GrpcCheckResult): string[] {
  const lines: string[] = ['## gRPC Result']
  const resp = grpc.response ?? {}

  const code = num(grpc.grpcStatusCode, resp.grpcStatusCode)
  const statusMsg = str(resp.grpcStatusMessage)
  if (code != null) lines.push(`- **Status:** ${code}${statusMsg ? ` ${statusMsg}` : ''}`)
  const healthLabel = str(resp.healthStatusLabel)
  if (healthLabel) lines.push(`- **Health:** ${healthLabel}`)
  const method = str(resp.grpcMethod)
  if (method) lines.push(`- **Method:** ${method}`)
  const responseMessage = str(resp.responseMessage)
  if (responseMessage) lines.push(`- **Response:** \`${truncateSingleLine(responseMessage, 200)}\``)
  const methods = Array.isArray(resp.discoveredMethods) ? resp.discoveredMethods : []
  if (methods.length > 0) lines.push(`- **Discovered methods:** ${methods.join(', ')}`)
  const timing = (grpc.timingPhases ?? resp.timingPhases) as
    { dns?: number, connect?: number, total?: number } | undefined
  const tDns = num(timing?.dns), tConnect = num(timing?.connect), tTotal = num(timing?.total)
  if (tDns != null || tConnect != null || tTotal != null) {
    lines.push('')
    lines.push('## Timing')
    lines.push('| Phase | Duration |')
    lines.push('| --- | --- |')
    if (tDns != null) lines.push(`| DNS | ${formatMs(tDns)} |`)
    if (tConnect != null) lines.push(`| Connect | ${formatMs(tConnect)} |`)
    if (tTotal != null) lines.push(`| **Total** | **${formatMs(tTotal)}** |`)
  }
  appendAssertionsMd(lines, grpc.assertions)
  if (grpc.requestError) {
    lines.push('')
    lines.push('## Error')
    lines.push(`- ${grpc.requestError}`)
  }

  return lines
}

// --- SSL check result ---

// SSL security-baseline rules, in display order, mapped to humanized labels.
// Each rule in `response.securityBaseline` is `{ violated, severity }`: a
// non-violated rule renders as a pass, a violated one as a fail, with the
// configured enforcement severity (fail / warn / ignore) shown alongside.
const SSL_BASELINE_RULES: Array<[string, string]> = [
  ['minTLSVersion', 'min TLS version'],
  ['minKeySizeBits', 'min key size'],
  ['weakSignatureAlgorithm', 'weak signature algorithm'],
  ['weakCipherSuite', 'weak cipher suite'],
  ['knownBadCA', 'known bad CA'],
  ['recommendedTLSVersion', 'recommended TLS version'],
  ['recommendedKeySizeBits', 'recommended key size'],
  ['ocspMustStapleRespected', 'OCSP must-staple respected'],
  ['sctPresent', 'SCT present'],
]

// Join SANs with a cap so a wildcard cert with dozens of names stays readable.
function formatSans (sans: unknown): string | undefined {
  if (!Array.isArray(sans)) return undefined
  const list = sans.filter((s): s is string => typeof s === 'string' && s.length > 0)
  if (list.length === 0) return undefined
  const cap = 10
  if (list.length <= cap) return list.join(', ')
  return `${list.slice(0, cap).join(', ')}, +${list.length - cap} more`
}

function asObject (value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? value as Record<string, unknown> : undefined
}

function appendSslCertificateTerminal (lines: string[], resp: Record<string, unknown>): void {
  const cert = asObject(resp.certificate)
  const ocspStapled = boolFlag(resp.ocspStapled)
  const body: string[] = []

  if (cert) {
    const subjectCN = str(cert.subjectCN)
    if (subjectCN) body.push(`${label('Subject CN:')}${subjectCN}`)
    const issuerCN = str(cert.issuerCN)
    if (issuerCN) body.push(`${label('Issuer CN:')}${issuerCN}`)
    const notBefore = str(cert.notBefore)
    const notAfter = str(cert.notAfter)
    if (notBefore || notAfter) body.push(`${label('Valid:')}${[notBefore, notAfter].filter(Boolean).join(' → ')}`)
    const keyAlgorithm = str(cert.keyAlgorithm)
    const keySizeBits = num(cert.keySizeBits)
    if (keyAlgorithm || keySizeBits != null) {
      body.push(`${label('Key:')}${[keyAlgorithm, keySizeBits != null ? `${keySizeBits}-bit` : null].filter(Boolean).join(' ')}`)
    }
    const signatureAlgorithm = str(cert.signatureAlgorithm)
    if (signatureAlgorithm) body.push(`${label('Signature:')}${signatureAlgorithm}`)
    const fingerprint = str(cert.fingerprintSha256)
    if (fingerprint) body.push(`${label('SHA-256:')}${fingerprint}`)
    const sans = formatSans(cert.sans)
    if (sans) body.push(`${label('SANs:')}${sans}`)
    const serial = str(cert.serialNumber)
    if (serial) body.push(`${label('Serial:')}${serial}`)
    if (boolFlag(cert.selfSigned) === true) body.push(`${label('Self-signed:')}${chalk.yellow('yes')}`)
    if (boolFlag(cert.isCA) === true) body.push(`${label('CA:')}yes`)
  }
  if (ocspStapled != null) body.push(`${label('OCSP stapled:')}${yesNo(ocspStapled)}`)

  if (body.length === 0) return
  lines.push('')
  lines.push(heading('CERTIFICATE', 2, 'terminal'))
  lines.push(...body)
}

function appendSslCertificateMd (lines: string[], resp: Record<string, unknown>): void {
  const cert = asObject(resp.certificate)
  const ocspStapled = boolFlag(resp.ocspStapled)
  const body: string[] = []

  if (cert) {
    const subjectCN = str(cert.subjectCN)
    if (subjectCN) body.push(`- **Subject CN:** ${subjectCN}`)
    const issuerCN = str(cert.issuerCN)
    if (issuerCN) body.push(`- **Issuer CN:** ${issuerCN}`)
    const notBefore = str(cert.notBefore)
    const notAfter = str(cert.notAfter)
    if (notBefore || notAfter) body.push(`- **Valid:** ${[notBefore, notAfter].filter(Boolean).join(' → ')}`)
    const keyAlgorithm = str(cert.keyAlgorithm)
    const keySizeBits = num(cert.keySizeBits)
    if (keyAlgorithm || keySizeBits != null) {
      body.push(`- **Key:** ${[keyAlgorithm, keySizeBits != null ? `${keySizeBits}-bit` : null].filter(Boolean).join(' ')}`)
    }
    const signatureAlgorithm = str(cert.signatureAlgorithm)
    if (signatureAlgorithm) body.push(`- **Signature:** ${signatureAlgorithm}`)
    const fingerprint = str(cert.fingerprintSha256)
    if (fingerprint) body.push(`- **SHA-256:** \`${fingerprint}\``)
    const sans = formatSans(cert.sans)
    if (sans) body.push(`- **SANs:** ${sans}`)
    const serial = str(cert.serialNumber)
    if (serial) body.push(`- **Serial:** ${serial}`)
    if (boolFlag(cert.selfSigned) === true) body.push('- **Self-signed:** yes')
    if (boolFlag(cert.isCA) === true) body.push('- **CA:** yes')
  }
  if (ocspStapled != null) body.push(`- **OCSP stapled:** ${ocspStapled ? 'yes' : 'no'}`)

  if (body.length === 0) return
  lines.push('')
  lines.push('## Certificate')
  lines.push(...body)
}

// Build the per-rule baseline breakdown as [symbol, humanLabel, severity, violated]
// tuples so terminal and markdown can render the same rules with format-specific
// styling. A rule that carries neither a `violated` flag nor a scalar value is
// skipped.
function sslBaselineRules (
  resp: Record<string, unknown>,
): Array<{ human: string, violated?: boolean, severity?: string, scalar?: string }> {
  const baseline = asObject(resp.securityBaseline)
  if (!baseline) return []
  const rules: Array<{ human: string, violated?: boolean, severity?: string, scalar?: string }> = []
  for (const [key, human] of SSL_BASELINE_RULES) {
    const rule = baseline[key]
    if (rule == null) continue
    const obj = asObject(rule)
    if (obj) {
      const violated = boolFlag(obj.violated)
      const severity = str(obj.severity)
      if (violated == null && severity == null) continue
      rules.push({ human, violated, severity })
    } else if (typeof rule === 'string' || typeof rule === 'number' || typeof rule === 'boolean') {
      rules.push({ human, scalar: String(rule) })
    }
  }
  return rules
}

function appendSslBaselineTerminal (lines: string[], resp: Record<string, unknown>): void {
  const rules = sslBaselineRules(resp)
  if (rules.length === 0) return
  lines.push('')
  lines.push(heading('SECURITY BASELINE', 2, 'terminal'))
  for (const rule of rules) {
    if (rule.violated == null && rule.scalar == null) {
      lines.push(`  ${chalk.dim('·')} ${rule.human}${rule.severity ? chalk.dim(` (${rule.severity})`) : ''}`)
      continue
    }
    if (rule.scalar != null) {
      lines.push(`  ${chalk.dim('·')} ${rule.human}: ${rule.scalar}`)
      continue
    }
    const head = `${rule.violated ? assertionSymbols.error : assertionSymbols.success} ${rule.human}`
    const coloredHead = rule.violated ? chalk.red(head) : chalk.green(head)
    lines.push(`  ${coloredHead}${rule.severity ? chalk.dim(` (${rule.severity})`) : ''}`)
  }
}

function appendSslBaselineMd (lines: string[], resp: Record<string, unknown>): void {
  const rules = sslBaselineRules(resp)
  if (rules.length === 0) return
  lines.push('')
  lines.push('## Security Baseline')
  for (const rule of rules) {
    if (rule.scalar != null) {
      lines.push(`- ${rule.human}: ${rule.scalar}`)
      continue
    }
    if (rule.violated == null) {
      lines.push(`- ${rule.human}${rule.severity ? ` (${rule.severity})` : ''}`)
      continue
    }
    const sym = rule.violated ? assertionSymbols.error : assertionSymbols.success
    lines.push(`- ${sym} ${rule.human}${rule.severity ? ` (${rule.severity})` : ''}`)
  }
}

function formatSslResultTerminal (ssl: SslCheckResult): string[] {
  const lines: string[] = []
  const resp = ssl.response ?? {}

  lines.push(heading('SSL RESULT', 2, 'terminal'))

  const ip = str(resp.resolvedIp)
  if (ip) lines.push(`${label('Resolved IP:')}${ip}`)

  const tls = str(ssl.tlsVersion, resp.protocol)
  const cipher = str(ssl.cipherSuite, resp.cipherSuite)
  if (tls || cipher) lines.push(`${label('TLS:')}${[tls, cipher].filter(Boolean).join(' / ')}`)

  const days = num(ssl.daysUntilExpiry, resp.daysUntilExpiry)
  if (days != null) {
    const text = days < 0 ? `expired ${-days} day(s) ago` : `${days} day(s)`
    lines.push(`${label('Expires in:')}${days <= 0 ? chalk.red(text) : days < 14 ? chalk.yellow(text) : chalk.green(text)}`)
  }

  const handshake = num(ssl.handshakeTimeMs, resp.handshakeTimeMs)
  if (handshake != null) lines.push(`${label('Handshake:')}${formatMs(handshake)}`)

  const chainTrusted = boolFlag(ssl.chainTrusted, resp.chainTrusted)
  if (chainTrusted != null) lines.push(`${label('Chain trusted:')}${yesNo(chainTrusted)}`)
  const hostnameVerified = boolFlag(ssl.hostnameVerified, resp.hostnameVerified)
  if (hostnameVerified != null) lines.push(`${label('Hostname:')}${yesNo(hostnameVerified)}`)

  const verdict = str(ssl.baselineVerdict)
  const grade = str(ssl.baselineGrade)
  if (verdict || grade) {
    const verdictStr = verdict ? (verdict === 'PASS' ? chalk.green(verdict) : chalk.red(verdict)) : ''
    lines.push(`${label('Baseline:')}${[verdictStr, grade ? `grade ${grade}` : ''].filter(Boolean).join(' ')}`)
  }

  const failure = str(ssl.failureCategory)
  if (failure) lines.push(`${label('Failure:')}${chalk.red(failure)}`)

  appendSslCertificateTerminal(lines, resp)
  appendSslBaselineTerminal(lines, resp)

  appendAssertionsTerminal(lines, ssl.assertions)

  if (ssl.requestError) {
    lines.push('')
    lines.push(heading('ERROR', 2, 'terminal'))
    lines.push(chalk.red(`  ${ssl.requestError}`))
  }

  return lines
}

function formatSslResultMd (ssl: SslCheckResult): string[] {
  const lines: string[] = ['## SSL Result']
  const resp = ssl.response ?? {}

  const tls = str(ssl.tlsVersion, resp.protocol)
  const cipher = str(ssl.cipherSuite, resp.cipherSuite)
  if (tls || cipher) lines.push(`- **TLS:** ${[tls, cipher].filter(Boolean).join(' / ')}`)
  const days = num(ssl.daysUntilExpiry, resp.daysUntilExpiry)
  if (days != null) lines.push(`- **Expires in:** ${days < 0 ? `expired ${-days} day(s) ago` : `${days} day(s)`}`)
  const handshake = num(ssl.handshakeTimeMs, resp.handshakeTimeMs)
  if (handshake != null) lines.push(`- **Handshake:** ${formatMs(handshake)}`)
  const chainTrusted = boolFlag(ssl.chainTrusted, resp.chainTrusted)
  if (chainTrusted != null) lines.push(`- **Chain trusted:** ${chainTrusted ? 'yes' : 'no'}`)
  const hostnameVerified = boolFlag(ssl.hostnameVerified, resp.hostnameVerified)
  if (hostnameVerified != null) lines.push(`- **Hostname verified:** ${hostnameVerified ? 'yes' : 'no'}`)
  const verdict = str(ssl.baselineVerdict)
  const grade = str(ssl.baselineGrade)
  if (verdict || grade) lines.push(`- **Baseline:** ${[verdict, grade ? `grade ${grade}` : ''].filter(Boolean).join(' ')}`)
  const failure = str(ssl.failureCategory)
  if (failure) lines.push(`- **Failure:** ${failure}`)
  appendSslCertificateMd(lines, resp)
  appendSslBaselineMd(lines, resp)
  appendAssertionsMd(lines, ssl.assertions)
  if (ssl.requestError) {
    lines.push('')
    lines.push('## Error')
    lines.push(`- ${ssl.requestError}`)
  }

  return lines
}

// --- Shared internal helpers ---

function colorStatus (code: number): string {
  if (code >= 200 && code < 300) return chalk.green(String(code))
  if (code >= 300 && code < 400) return chalk.yellow(String(code))
  return chalk.red(String(code))
}

function formatErrorEntry (err: unknown): string {
  if (typeof err === 'string') return err
  if (err && typeof err === 'object') {
    // API may return error objects with message/name fields
    const obj = err as Record<string, unknown>
    if (obj.message) return String(obj.message)
    return JSON.stringify(err)
  }
  return String(err)
}

function appendErrors (lines: string[], errors: unknown[]): void {
  if (errors.length === 0) return
  lines.push('', heading('ERRORS', 2, 'terminal'))
  for (const err of errors) lines.push(chalk.red(`  ${formatErrorEntry(err)}`))
}

function appendAssets (
  lines: string[],
  obj: { jobAssets?: string[] | null, playwrightTestTraces?: string[], playwrightTestVideos?: string[] },
): void {
  const parts: string[] = []
  if (obj.jobAssets?.length) parts.push(`${obj.jobAssets.length} screenshot(s)`)
  if (obj.playwrightTestTraces?.length) parts.push(`${obj.playwrightTestTraces.length} trace(s)`)
  if (obj.playwrightTestVideos?.length) parts.push(`${obj.playwrightTestVideos.length} video(s)`)
  if (parts.length > 0) {
    lines.push('', heading('ASSETS', 2, 'terminal'))
    lines.push(`  ${parts.join(', ')}`)
    lines.push(chalk.dim('  Use --output json to get asset URLs'))
  }
}

function wrapText (text: string, indent: string, width: number): string[] {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    if (paragraph.length === 0) {
      lines.push(indent)
      continue
    }
    const words = paragraph.split(/\s+/)
    let current = indent
    for (const word of words) {
      if (current.length + word.length + 1 > width && current !== indent) {
        lines.push(current)
        current = indent + word
      } else {
        current += (current === indent ? '' : ' ') + word
      }
    }
    if (current !== indent) lines.push(current)
  }
  return lines
}

function formatBody (body: string, indent: string): string {
  let text: string
  try {
    text = JSON.stringify(JSON.parse(body), null, 2)
  } catch {
    text = body
  }
  const lines = text.split('\n')
  if (lines.length > 30) {
    return lines.slice(0, 30).map(l => indent + l).join('\n')
      + `\n${indent}${chalk.dim(`... (${lines.length - 30} more lines)`)}`
  }
  return lines.map(l => indent + l).join('\n')
}

function formatTimingBar (tp: NonNullable<ApiCheckResult['response']['timingPhases']>): string {
  const phases: Array<{ name: string, ms: number, color: (s: string) => string }> = [
    { name: 'DNS', ms: tp.dns, color: chalk.cyan },
    { name: 'TCP', ms: tp.tcp, color: chalk.blue },
    { name: 'TLS', ms: tp.wait, color: chalk.magenta },
    { name: 'TTFB', ms: tp.firstByte, color: chalk.yellow },
    { name: 'Download', ms: tp.download, color: chalk.green },
  ]

  const lines: string[] = []
  for (const phase of phases) {
    if (phase.ms > 0) {
      lines.push(`  ${label(phase.name + ':', 12)}${phase.color(formatMs(phase.ms))}`)
    }
  }
  lines.push(`  ${label('Total:', 12)}${chalk.bold(formatMs(tp.total))}`)
  return lines.join('\n')
}

function formatVitalValue (name: string, v: WebVitalEntry): string {
  if (v.value == null) return '-'
  if (name === 'CLS') return String(v.value.toFixed(3))
  return formatMs(v.value)
}

function vitalScore (score: string): string {
  switch (score) {
    case 'GOOD': return chalk.green('good')
    case 'NEEDS_IMPROVEMENT': return chalk.yellow('needs improvement')
    case 'POOR': return chalk.red('poor')
    default: return chalk.dim(score)
  }
}

// --- Job log formatting ---

function formatJobLogArray (log: Array<{ time: number, msg: string, level: string }>): string[] {
  const lines: string[] = [heading('JOB LOG', 2, 'terminal')]
  const maxLines = 50
  const entries = log.slice(0, maxLines)

  for (const entry of entries) {
    const level = entry.level === 'ERROR' ? chalk.red(entry.level) : chalk.dim(entry.level)
    lines.push(`  ${level} ${entry.msg}`)
  }

  if (log.length > maxLines) {
    lines.push(chalk.dim(`  ... (${log.length - maxLines} more entries)`))
  }

  return lines
}

function formatJobLogObject (log: unknown): string[] {
  if (!log) return []

  if (Array.isArray(log)) {
    return formatJobLogArray(log)
  }

  if (typeof log === 'object' && log !== null) {
    const obj = log as Record<string, unknown>
    const phases = ['setup', 'request', 'teardown'] as const
    const allEntries: Array<{ time: number, msg: string, level: string }> = []
    for (const phase of phases) {
      const entries = obj[phase]
      if (Array.isArray(entries)) {
        allEntries.push(...entries)
      }
    }
    if (allEntries.length > 0) {
      return formatJobLogArray(allEntries)
    }
  }

  const lines: string[] = [heading('JOB LOG', 2, 'terminal')]
  try {
    const pretty = JSON.stringify(log, null, 2)
    const jsonLines = pretty.split('\n').slice(0, 50)
    for (const l of jsonLines) {
      lines.push(`  ${l}`)
    }
  } catch {
    lines.push(`  ${String(log)}`)
  }

  return lines
}
