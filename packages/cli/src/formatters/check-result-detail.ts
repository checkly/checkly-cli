import chalk from 'chalk'
import type {
  CheckResult,
  ApiCheckResult,
  BrowserCheckResult,
  MultiStepCheckResult,
  WebVitalEntry,
} from '../rest/check-results'
import {
  type OutputFormat,
  type DetailField,
  formatMs,
  formatDate,
  resolveResultStatus,
  heading,
  renderDetailFields,
} from './render'

// --- Helpers ---

function label (text: string, width = 16): string {
  return chalk.dim(text.padEnd(width))
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

  if (browser.errors.length > 0) {
    lines.push('')
    lines.push(heading('ERRORS', 2, 'terminal'))
    for (const err of browser.errors) {
      lines.push(chalk.red(`  ${err}`))
    }
  }

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

  const assets: string[] = []
  if (browser.jobAssets && browser.jobAssets.length > 0) {
    assets.push(`${browser.jobAssets.length} screenshot(s)`)
  }
  if (browser.playwrightTestTraces && browser.playwrightTestTraces.length > 0) {
    assets.push(`${browser.playwrightTestTraces.length} trace(s)`)
  }
  if (browser.playwrightTestVideos && browser.playwrightTestVideos.length > 0) {
    assets.push(`${browser.playwrightTestVideos.length} video(s)`)
  }
  if (assets.length > 0) {
    lines.push('')
    lines.push(heading('ASSETS', 2, 'terminal'))
    lines.push(`  ${assets.join(', ')}`)
    lines.push(chalk.dim('  Use --output json to get asset URLs'))
  }

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
      lines.push(`- ${err}`)
    }
  }

  return lines
}

// --- Multi-step check result (terminal only — markdown has no special multi-step section) ---

function formatMultiStepResultTerminal (ms: MultiStepCheckResult): string[] {
  const lines: string[] = []

  lines.push(heading('MULTI-STEP RESULT', 2, 'terminal'))
  lines.push(`${label('Runtime:')}${ms.runtimeVersion}`)

  if (ms.errors.length > 0) {
    lines.push('')
    lines.push(heading('ERRORS', 2, 'terminal'))
    for (const err of ms.errors) {
      lines.push(chalk.red(`  ${err}`))
    }
  }

  if (ms.jobLog && ms.jobLog.length > 0) {
    lines.push('')
    lines.push(...formatJobLogArray(ms.jobLog))
  }

  const assets: string[] = []
  if (ms.jobAssets && ms.jobAssets.length > 0) {
    assets.push(`${ms.jobAssets.length} screenshot(s)`)
  }
  if (ms.playwrightTestTraces && ms.playwrightTestTraces.length > 0) {
    assets.push(`${ms.playwrightTestTraces.length} trace(s)`)
  }
  if (assets.length > 0) {
    lines.push('')
    lines.push(heading('ASSETS', 2, 'terminal'))
    lines.push(`  ${assets.join(', ')}`)
    lines.push(chalk.dim('  Use --output json to get asset URLs'))
  }

  return lines
}

// --- Shared internal helpers ---

function colorStatus (code: number): string {
  if (code >= 200 && code < 300) return chalk.green(String(code))
  if (code >= 300 && code < 400) return chalk.yellow(String(code))
  return chalk.red(String(code))
}

function formatBody (body: string, indent: string): string {
  try {
    const parsed = JSON.parse(body)
    const pretty = JSON.stringify(parsed, null, 2)
    const lines = pretty.split('\n')
    if (lines.length > 30) {
      return lines.slice(0, 30).map(l => indent + l).join('\n') + `\n${indent}${chalk.dim(`... (${lines.length - 30} more lines)`)}`
    }
    return lines.map(l => indent + l).join('\n')
  } catch {
    const lines = body.split('\n')
    if (lines.length > 30) {
      return lines.slice(0, 30).map(l => indent + l).join('\n') + `\n${indent}${chalk.dim(`... (${lines.length - 30} more lines)`)}`
    }
    return lines.map(l => indent + l).join('\n')
  }
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
