import chalk from 'chalk'
import type { RootCauseAnalysis, ErrorGroup } from '../rest/error-groups'
import { type OutputFormat, heading } from './render'

function label (text: string, width = 16): string {
  return chalk.dim(text.padEnd(width))
}

export function formatRcaDetail (rca: RootCauseAnalysis, format: OutputFormat): string {
  if (format === 'md') {
    return formatRcaMd(rca)
  }
  return formatRcaTerminal(rca)
}

function formatRcaTerminal (rca: RootCauseAnalysis): string {
  const a = rca.analysis
  const lines: string[] = []

  lines.push(heading('ROOT CAUSE ANALYSIS', 1, 'terminal'))
  lines.push('')
  lines.push(`${label('Classification:')}${chalk.cyan(a.classification)}`)
  lines.push(`${label('Root cause:')}${a.rootCause}`)
  lines.push(`${label('User impact:')}${a.userImpact}`)

  if (a.codeFix) {
    lines.push(`${label('Code fix:')}${a.codeFix}`)
  }

  if (a.evidence && a.evidence.length > 0) {
    lines.push('')
    lines.push(`  ${heading('EVIDENCE', 2, 'terminal')}`)
    for (const e of a.evidence) {
      const artifacts = e.artifacts.map(ar => `${ar.name} (${ar.type})`).join(', ')
      lines.push(`  ${chalk.dim('·')} ${chalk.bold(artifacts)} — ${e.description}`)
    }
  }

  if (a.referenceLinks && a.referenceLinks.length > 0) {
    lines.push('')
    lines.push(`  ${heading('REFERENCES', 2, 'terminal')}`)
    for (const ref of a.referenceLinks) {
      lines.push(`  ${chalk.dim('·')} ${ref.title}  ${chalk.dim(ref.url)}`)
    }
  }

  return lines.join('\n')
}

function formatRcaMd (rca: RootCauseAnalysis): string {
  const a = rca.analysis
  const lines: string[] = []

  lines.push('## Root Cause Analysis')
  lines.push('')
  lines.push(`**Classification:** ${a.classification}`)
  lines.push('')
  lines.push(`**Root Cause:** ${a.rootCause}`)
  lines.push('')
  lines.push(`**User Impact:** ${a.userImpact}`)

  if (a.codeFix) {
    lines.push('')
    lines.push(`**Code Fix:** ${a.codeFix}`)
  }

  if (a.evidence && a.evidence.length > 0) {
    lines.push('')
    lines.push('### Evidence')
    for (const e of a.evidence) {
      const artifacts = e.artifacts.map(ar => `${ar.name} (${ar.type})`).join(', ')
      lines.push(`- **${artifacts}** — ${e.description}`)
    }
  }

  if (a.referenceLinks && a.referenceLinks.length > 0) {
    lines.push('')
    lines.push('### References')
    for (const ref of a.referenceLinks) {
      lines.push(`- [${ref.title}](${ref.url})`)
    }
  }

  return lines.join('\n')
}

export function formatRcaHint (count: number, format: OutputFormat): string {
  if (count <= 1) return ''
  const more = count - 1
  const text = `(${more} more ${more === 1 ? 'analysis' : 'analyses'} available)`
  return format === 'terminal' ? chalk.dim(text) : `*${text}*`
}

export interface ErrorGroupJsonOutput {
  id: string
  checkId: string
  errorHash: string
  rawErrorMessage: string | null
  cleanedErrorMessage: string
  firstSeen: string
  lastSeen: string
  archivedUntilNextEvent: boolean
  latestRootCauseAnalysis: {
    id: string
    classification: string
    rootCause: string
    userImpact: string
    codeFix: string | null
    evidence: RootCauseAnalysis['analysis']['evidence']
    referenceLinks: RootCauseAnalysis['analysis']['referenceLinks']
    provider: string
    model: string
    durationMs: number
    created_at: string
  } | null
  rootCauseAnalysisCount: number
}

export interface RcaPendingInfo {
  rcaId: string
  errorGroupId: string
  checkId: string
}

export function formatRcaPending (info: RcaPendingInfo, format: OutputFormat | 'json'): string {
  if (format === 'json') {
    return JSON.stringify({
      id: info.rcaId,
      status: 'pending',
      errorGroupId: info.errorGroupId,
    }, null, 2)
  }

  if (format === 'md') {
    return [
      '# Root Cause Analysis',
      '',
      '| Field | Value |',
      '| --- | --- |',
      `| RCA ID | ${info.rcaId} |`,
      `| Error group | ${info.errorGroupId} |`,
      '| Status | pending |',
    ].join('\n')
  }

  const lines: string[] = []
  lines.push(chalk.bold('Root cause analysis triggered.'))
  lines.push('')
  lines.push(`${label('RCA ID:')}${info.rcaId}`)
  lines.push(`${label('Error group:')}${info.errorGroupId}`)
  lines.push(`${label('Status:')}${chalk.yellow('pending')}`)
  lines.push('')
  lines.push(`  ${chalk.dim('Watch progress:')}  checkly rca get ${info.rcaId} --watch`)
  lines.push(`  ${chalk.dim('View result:')}    checkly checks get ${info.checkId} --error-group ${info.errorGroupId}`)
  return lines.join('\n')
}

export function formatRcaCompleted (rca: RootCauseAnalysis, format: OutputFormat | 'json'): string {
  if (format === 'json') {
    return JSON.stringify(rca, null, 2)
  }
  return formatRcaDetail(rca, format)
}

export function transformErrorGroupForJson (errorGroup: ErrorGroup): ErrorGroupJsonOutput {
  const { rootCauseAnalyses, ...rest } = errorGroup
  const rcas = rootCauseAnalyses ?? []
  const latest = rcas[0] ?? null

  return {
    ...rest,
    latestRootCauseAnalysis: latest
      ? {
          id: latest.id,
          classification: latest.analysis.classification,
          rootCause: latest.analysis.rootCause,
          userImpact: latest.analysis.userImpact,
          codeFix: latest.analysis.codeFix,
          evidence: latest.analysis.evidence,
          referenceLinks: latest.analysis.referenceLinks,
          provider: latest.provider,
          model: latest.model,
          durationMs: latest.durationMs,
          created_at: latest.created_at,
        }
      : null,
    rootCauseAnalysisCount: rcas.length,
  }
}
