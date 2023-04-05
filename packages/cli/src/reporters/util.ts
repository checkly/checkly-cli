import * as chalk from 'chalk'
import * as indentString from 'indent-string'
import { DateTime } from 'luxon'
import * as logSymbols from 'log-symbols'

import { Assertion } from '../constructs/api-check'
import { getDefaults } from '../rest/api'

// eslint-disable-next-line no-restricted-syntax
export enum CheckStatus {
  PENDING,
  FAILED,
  SUCCESSFUL,
}

export function formatDuration (ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`
  } else {
    return `${Math.ceil(ms / 1000)}s`
  }
}

export function formatCheckTitle (status: CheckStatus, check: any, opts: { includeSourceFile?: boolean } = {}) {
  let duration
  if (check.startedAt && check.stoppedAt) {
    const durationMs = DateTime.fromISO(check.stoppedAt)
      .diff(DateTime.fromISO(check.startedAt))
      .toMillis()
    duration = formatDuration(durationMs)
  }

  let statusString
  let format
  if (status === CheckStatus.SUCCESSFUL) {
    statusString = chalk.bold.green(logSymbols.success)
    format = chalk.bold
  } else if (status === CheckStatus.FAILED) {
    statusString = logSymbols.error
    format = chalk.bold.red
  } else {
    statusString = '-'
    format = chalk.bold.dim
  }

  return [
    format(statusString),
    opts.includeSourceFile ? format(`${check.sourceFile} >`) : undefined,
    format(check.name),
    duration ? `(${duration})` : undefined,
  ].filter(Boolean).join(' ')
}

export function formatCheckResult (checkResult: any) {
  const result = []
  if (checkResult.checkType === 'API') {
    // Order should follow the check lifecycle (response, then assertions)
    if (checkResult.checkRunData?.requestError) {
      result.push([
        formatSectionTitle('Request Error'),
        checkResult.checkRunData.requestError,
      ])
    } else {
      if (checkResult.checkRunData?.request) {
        result.push([
          formatSectionTitle('HTTP Request'),
          formatHttpRequest(checkResult.checkRunData.request),
        ])
      }
      if (checkResult.checkRunData?.response) {
        result.push([
          formatSectionTitle('HTTP Response'),
          formatHttpResponse(checkResult.checkRunData.response),
        ])
      }
      if (checkResult.checkRunData?.assertions?.length) {
        result.push([
          formatSectionTitle('Assertions'),
          formatAssertions(checkResult.checkRunData.assertions),
        ])
      }
      if (checkResult.logs?.setup.length) {
        result.push([
          formatSectionTitle('Setup Script Logs'),
          formatLogs(checkResult.logs.setup),
        ])
      }
      if (checkResult.logs?.teardown.length) {
        result.push([
          formatSectionTitle('Teardown Script Logs'),
          formatLogs(checkResult.logs.teardown),
        ])
      }
    }
  }
  if (checkResult.logs?.length) {
    result.push([
      formatSectionTitle('Logs'),
      formatLogs(checkResult.logs),
    ])
  }
  if (checkResult.runError) {
    result.push([
      formatSectionTitle('Execution Error'),
      formatRunError(checkResult.runError),
    ])
  }
  if (checkResult.scheduleError) {
    result.push([
      formatSectionTitle('Scheduling Error'),
      formatRunError(checkResult.scheduleError),
    ])
  }
  return result.map(([title, body]) => title + '\n' + body).join('\n\n')
}

const assertionSources: any = {
  STATUS_CODE: 'status code',
  JSON_BODY: 'JSON body',
  HEADERS: 'headers',
  TEXT_BODY: 'text body',
  RESPONSE_TIME: 'response time',
}

const assertionComparisons: any = {
  EQUALS: 'equals',
  NOT_EQUALS: 'doesn\'t equal',
  HAS_KEY: 'has key',
  NOT_HAS_KEY: 'doesn\'t have key',
  HAS_VALUE: 'has value',
  NOT_HAS_VALUE: 'doesn\'t have value',
  IS_EMPTY: 'is empty',
  NOT_EMPTY: 'is not empty',
  GREATER_THAN: 'is greater than',
  LESS_THAN: 'is less than',
  CONTAINS: 'contains',
  NOT_CONTAINS: 'doesn\'t contain',
  IS_NULL: 'is null',
  NOT_NULL: 'is not null',
}

function formatAssertions (assertions: Array<Assertion&{ error: string, actual: any }>) {
  return assertions.map(({ source, property, comparison, target, regex, error, actual }) => {
    const assertionFailed = !!error
    const humanSource = assertionSources[source] || source
    const humanComparison = assertionComparisons[comparison] || comparison
    let actualString
    if (actual) {
      const { result: truncatedActual, lines: truncatedActualLines } = truncate(actual, {
        chars: 300,
        lines: 5,
        ending: chalk.magenta('\n...truncated...'),
      })

      if (truncatedActualLines <= 1) {
        actualString = `Received: ${truncatedActual}.`
      } else {
        actualString = `Received:\n${indentString(truncatedActual, 4, { indent: ' ' })}`
      }
    }
    const message = [
      assertionFailed ? logSymbols.error : logSymbols.success,
      humanSource,
      property ? `property "${property}"` : undefined,
      regex ? `regex "${regex}"` : undefined,
      humanComparison,
      `target "${target}".`,
      actualString,
    ].filter(Boolean).join(' ')
    return assertionFailed ? chalk.red(message) : chalk.green(message)
  }).join('\n')
}

function formatHttpRequest (request: any) {
  const { truncated, result: stringBody } = truncate(request.data, {
    chars: 20 * 100,
    lines: 20,
    ending: chalk.magenta('\n...truncated...'),
  })
  const headersString = Object.entries(request.headers ?? []).map(([key, val]) => `${key}: ${val}`).join('\n')
  return [
    `${request.method} ${request.url}`,
    'Headers:',
    indentString(headersString, 2),
    request.data ? 'Body:' : undefined,
    indentString(stringBody, 2),
  ].filter(Boolean).join('\n')
}

function formatHttpResponse (response: any) {
  // TODO: Provide a user for a way to see the full response. For example, write it to a file.
  const { truncated, result: stringBody } = truncate(response.body, {
    chars: 20 * 100,
    lines: 20,
    ending: chalk.magenta('\n...truncated...'),
  })
  const headersString = Object.entries(response.headers ?? []).map(([key, val]) => `${key}: ${val}`).join('\n')
  return [
    `Status Code: ${response.status} ${response.statusText}`,
    'Headers:',
    indentString(headersString, 2),
    response.body ? 'Body:' : undefined,
    indentString(stringBody, 2),
  ].filter(Boolean).join('\n')
}

function formatLogs (logs: Array<{ level: string, msg: string, time: number }>) {
  return logs.flatMap(({ level, msg, time }) => {
    const timestamp = DateTime.fromMillis(time).toLocaleString(DateTime.TIME_24_WITH_SECONDS)
    let format = chalk.dim
    if (level === 'WARN') {
      format = chalk.dim.yellow
    } else if (level === 'ERROR') {
      format = chalk.dim.red
    }
    const [firstLine, ...remainingLines] = msg.split('\n')
    return [
      `${timestamp} ${level.padEnd(5, ' ')} ${format(firstLine)}`,
      ...remainingLines.map((line) => format(line)),
    ]
  }).join('\n')
}

function formatRunError (err: string | Error): string {
  if (typeof err === 'string') {
    return err
  } else {
    return err.message
  }
}

function formatSectionTitle (title: string): string {
  const width = process.stdout.isTTY ? Math.min(process.stdout.columns, 80) : 80
  return `──${chalk.bold(title)}${'─'.repeat(width - title.length)}`
}

function truncate (val: any, opts: { chars?: number, lines?: number, ending?: string }) {
  let truncated = false
  let result = toString(val)
  if (opts.chars && val.length > opts.chars) {
    truncated = true
    result = result.substring(0, opts.chars)
  }
  const lines = result.split('\n')
  if (opts.lines && lines.length > opts.lines) {
    truncated = true
    result = lines.slice(0, opts.lines).join('\n')
  }
  return {
    truncated,
    result: truncated && opts.ending ? result + opts.ending : result,
    lines: opts.lines ? Math.min(opts.lines, lines.length) : lines.length,
  }
}

function toString (val: any): string {
  if (typeof val === 'object') {
    return JSON.stringify(val, null, 2)
  } else {
    return val.toString()
  }
}

export function print (text: string) {
  process.stdout.write(text)
}

export function printLn (text: string, afterLnCount = 1, beforeLnCount = 0) {
  process.stdout.write(`${'\n'.repeat(beforeLnCount)}${text}${'\n'.repeat(afterLnCount)}`)
}

export function getTestSessionUrl (testSessionId: string): string {
  const { baseURL } = getDefaults()
  return `${baseURL.replace(/api/, 'app')}/test-sessions/${testSessionId}`
}

export function getTraceUrl (traceUrl: string): string {
  return `https://trace.playwright.dev/?trace=${encodeURIComponent(traceUrl)}`
}

export function printDeprecationWarning (text: string): void {
  console.log(chalk.yellow(`\n${logSymbols.warning} Deprecation warning: ${text} \n`))
}
